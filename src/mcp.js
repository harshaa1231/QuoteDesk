// Minimal, stateless MCP server over Streamable HTTP (JSON responses).
// Claude (the customer's own plan) does all the thinking; these tools only store and fetch data.
import {
  createQuote, getQuoteByNumber, getItems, getEvents, updateQuote, setStatus, listQuotes,
  computeTotals, formatMoney, displayStatus, cleanItems, toCents,
} from './db.js';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `QuoteDesk stores, hosts and tracks sales quotations for a small business.
Use create_quote when the user describes a job they want to price (often a pasted client message or call notes).
Break the work into clear line items with quantity and unit price in major currency units (e.g. 45000 means ₹45,000), before tax.
Put scope, assumptions and deliverables in "notes" so the client sees them. Do not invent client email addresses.
If the user gives no prices, ask or use sensible market rates and say you did so.
After creating or updating, give the user the edit link (to review) and the client link (to share).
Use list_quotes to find quotes that were viewed but not answered, so you can help the user follow up.`;

const itemSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'What the client is paying for, one line' },
    quantity: { type: 'number', description: 'Quantity (default 1)' },
    unit_price: { type: 'number', description: 'Price per unit in major currency units, before tax' },
  },
  required: ['description', 'unit_price'],
};

const TOOLS = [
  {
    name: 'create_quote',
    title: 'Create quote',
    description:
      'Create a new quotation in QuoteDesk from a job description. Returns the quote number, totals, a link for the owner to edit it and a public link the client can open and accept.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: "Short name of the job, e.g. 'Website redesign + 3 months SEO'" },
        client_name: { type: 'string', description: 'Contact person at the client' },
        client_company: { type: 'string' },
        client_email: { type: 'string' },
        items: { type: 'array', minItems: 1, items: itemSchema },
        tax_rate_percent: { type: 'number', description: 'Tax rate in percent. Omit to use the business default (e.g. 18% GST).' },
        discount: { type: 'number', description: 'Flat discount in major currency units, applied before tax' },
        currency: { type: 'string', description: 'ISO code, e.g. INR, USD, SGD. Omit to use the business default.' },
        notes: { type: 'string', description: 'Scope, deliverables, timeline and assumptions shown to the client' },
        terms: { type: 'string', description: 'Payment terms. Omit to use the business default.' },
        valid_for_days: { type: 'integer', description: 'How many days the quote is valid (default 15)' },
      },
      required: ['title', 'client_name', 'items'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'list_quotes',
    title: 'List quotes',
    description:
      'List quotes with status, total, and whether the client has opened them. Status "viewed" means the client opened it but has not accepted or declined yet.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'] },
        limit: { type: 'integer', description: 'Max quotes to return (default 20)' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_quote',
    title: 'Get quote',
    description: 'Get one quote in full: line items, totals, client response and activity history.',
    inputSchema: {
      type: 'object',
      properties: { quote_number: { type: 'string', description: 'e.g. Q-0003 or 3' } },
      required: ['quote_number'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'update_quote',
    title: 'Update quote',
    description:
      'Change an existing quote. Only send the fields to change. If "items" is sent it replaces all line items. Status can be set to draft or sent; only the client can accept or decline.',
    inputSchema: {
      type: 'object',
      properties: {
        quote_number: { type: 'string' },
        title: { type: 'string' },
        client_name: { type: 'string' },
        client_company: { type: 'string' },
        client_email: { type: 'string' },
        items: { type: 'array', items: itemSchema },
        tax_rate_percent: { type: 'number' },
        discount: { type: 'number' },
        currency: { type: 'string' },
        notes: { type: 'string' },
        terms: { type: 'string' },
        valid_until: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: ['draft', 'sent'] },
      },
      required: ['quote_number'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_business_profile',
    title: 'Get business profile',
    description: 'Get the business name, default currency, default tax rate and payment terms, to write quotes that fit this business.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

function text(t, isError = false) {
  return { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) };
}

function links(origin, q) {
  return `Edit (for you): ${origin}/app/q/${q.number}\nClient link (share this): ${origin}/q/${q.public_id}`;
}

function summarize(q, items, origin) {
  const t = computeTotals(items, q.tax_rate, q.discount_cents);
  const lines = items.map(
    (it, i) => `  ${i + 1}. ${it.description} — ${it.quantity} × ${formatMoney(it.unit_price_cents, q.currency)} = ${formatMoney(t.lines[i], q.currency)}`
  );
  return [
    `${q.number} · ${q.title}`,
    `Client: ${q.client_name}${q.client_company ? ' (' + q.client_company + ')' : ''}${q.client_email ? ' <' + q.client_email + '>' : ''}`,
    `Status: ${displayStatus(q)}${q.view_count ? ` · opened ${q.view_count} time(s), last ${q.last_viewed_at} UTC` : ' · not opened yet'}`,
    `Valid until: ${q.valid_until}`,
    'Items:',
    ...lines,
    `Subtotal ${formatMoney(t.subtotal, q.currency)}${t.discount ? ` · Discount -${formatMoney(t.discount, q.currency)}` : ''} · Tax ${q.tax_rate}% ${formatMoney(t.tax, q.currency)} · Total ${formatMoney(t.total, q.currency)}`,
    q.responder_name ? `Client response: ${q.status} by ${q.responder_name}${q.response_note ? ' — "' + q.response_note + '"' : ''}` : '',
    links(origin, q),
  ].filter(Boolean).join('\n');
}

async function callTool(env, account, origin, name, args = {}) {
  const db = env.DB;
  switch (name) {
    case 'create_quote': {
      const items = cleanItems(args.items);
      if (!args.title || !args.client_name || !items.length) {
        return text('title, client_name and at least one item with a description are required.', true);
      }
      const q = await createQuote(db, account, { ...args, items: args.items }, 'claude');
      const its = await getItems(db, q.id);
      return text(`Created quote in QuoteDesk.\n\n${summarize(q, its, origin)}\n\nIt is a draft. The owner can review and edit it at the edit link, then share the client link.`);
    }
    case 'list_quotes': {
      const quotes = await listQuotes(db, account.id, { status: args.status || 'all', limit: Math.min(100, args.limit || 20) });
      if (!quotes.length) return text('No quotes found' + (args.status && args.status !== 'all' ? ` with status ${args.status}.` : '.'));
      const rows = quotes.map(
        (q) =>
          `${q.number} | ${q.title} | ${q.client_name}${q.client_company ? ' / ' + q.client_company : ''} | ${formatMoney(q.totals.total, q.currency)} | ${q.display_status}` +
          `${q.view_count ? ` (opened ${q.view_count}×, last ${q.last_viewed_at})` : ''} | created ${q.created_at.slice(0, 10)}`
      );
      return text(`${quotes.length} quote(s):\n` + rows.join('\n') + `\n\nDashboard: ${origin}/app`);
    }
    case 'get_quote': {
      const q = await getQuoteByNumber(db, account.id, args.quote_number);
      if (!q) return text(`No quote ${args.quote_number} found.`, true);
      const [its, evs] = await Promise.all([getItems(db, q.id), getEvents(db, q.id)]);
      const history = evs.map((e) => `  ${e.created_at} UTC — ${e.detail}`).join('\n');
      return text(`${summarize(q, its, origin)}\n\nNotes: ${q.notes || '-'}\nTerms: ${q.terms || '-'}\n\nActivity:\n${history}`);
    }
    case 'update_quote': {
      let q = await getQuoteByNumber(db, account.id, args.quote_number);
      if (!q) return text(`No quote ${args.quote_number} found.`, true);
      if (q.status === 'accepted' || q.status === 'declined') {
        return text(`${q.number} was already ${q.status} by the client, so it is locked. Create a new quote instead.`, true);
      }
      const fields = {};
      for (const k of ['title', 'client_name', 'client_company', 'client_email', 'currency', 'notes', 'terms', 'valid_until']) {
        if (args[k] !== undefined) fields[k] = args[k];
      }
      if (args.tax_rate_percent !== undefined) fields.tax_rate = args.tax_rate_percent;
      if (args.discount !== undefined) fields.discount_cents = toCents(args.discount);
      const items = args.items ? cleanItems(args.items) : null;
      q = await updateQuote(db, q, fields, items, 'Claude');
      if (args.status && args.status !== q.status) {
        await setStatus(db, q, args.status, 'Claude');
        q = await getQuoteByNumber(db, account.id, q.number);
      }
      const its = await getItems(db, q.id);
      return text(`Updated.\n\n${summarize(q, its, origin)}`);
    }
    case 'get_business_profile': {
      return text(
        [
          `Business: ${account.business_name}`,
          `Default currency: ${account.currency}`,
          `Default tax rate: ${account.default_tax_rate}%`,
          `Default payment terms: ${account.default_terms || '-'}`,
          account.business_address ? `Address: ${account.business_address}` : '',
          account.tax_id ? `Tax ID: ${account.tax_id}` : '',
        ].filter(Boolean).join('\n')
      );
    }
    default:
      return null;
  }
}

async function handleMessage(env, account, origin, msg) {
  const { id, method, params } = msg || {};
  const isRequest = id !== undefined && id !== null && typeof method === 'string';
  if (!isRequest) return null; // notifications and stray responses get no reply
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'quotedesk', title: 'QuoteDesk', version: '1.0.0' },
        instructions: INSTRUCTIONS + `\n\nThis connector belongs to: ${account.business_name}.`,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        const res = await callTool(env, account, origin, params?.name, params?.arguments || {});
        if (!res) return err(-32602, `Unknown tool: ${params?.name}`);
        return ok(res);
      } catch (e) {
        return ok(text('QuoteDesk error: ' + (e && e.message ? e.message : String(e)), true));
      }
    }
    case 'resources/list':
      return ok({ resources: [] });
    case 'resources/templates/list':
      return ok({ resourceTemplates: [] });
    case 'prompts/list':
      return ok({ prompts: [] });
    default:
      return err(-32601, `Method not found: ${method}`);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export async function handleMcp(request, env, key) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'GET') {
    // No server-initiated stream in this stateless server.
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST', ...CORS } });
  }
  if (request.method === 'DELETE') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const account = await env.DB.prepare('SELECT * FROM accounts WHERE mcp_key = ?').bind(key).first();
  if (!account) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unknown QuoteDesk connector key. Copy your MCP URL from Settings.' } }, 404);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  const origin = new URL(request.url).origin;

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleMessage(env, account, origin, m)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handleMessage(env, account, origin, body);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
}
