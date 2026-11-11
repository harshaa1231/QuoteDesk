// QuoteDesk: a Cloudflare Worker that Claude talks to over MCP.
// No AI SDKs or AI keys anywhere: Claude (the customer's own plan) writes, this app stores, hosts and tracks.
import { handleMcp } from './mcp.js';
import {
  ensureDemo, createAccount, getAccountByEmail, updateAccount, createQuote, getQuoteByNumber,
  getQuoteByPublicId, getItems, getEvents, updateQuote, setStatus, recordView, recordResponse,
  deleteQuote, listQuotes, cleanItems, toCents, toNumber, displayStatus,
} from './db.js';
import { verifyPassword, createSession, sessionCookie, getSessionAccount, destroySession } from './auth.js';
import {
  landingPage, authPage, dashboardPage, editorPage, settingsPage, publicQuotePage, messagePage,
} from './views.js';

const html = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      ...headers,
    },
  });

const redirect = (location, headers = {}) => new Response(null, { status: 303, headers: { Location: location, ...headers } });

let demoReady = false;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return html(messagePage('Something went wrong', 'Please try again in a moment.', 500), 500);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const origin = url.origin;

  if (!demoReady) {
    await ensureDemo(env);
    demoReady = true;
  }

  // ---- MCP endpoint: /mcp/<workspace key> ----
  const mcpMatch = path.match(/^\/mcp\/([A-Za-z0-9_\-]+)$/);
  if (mcpMatch) return handleMcp(request, env, mcpMatch[1]);
  if (path === '/mcp') {
    return new Response(JSON.stringify({ error: 'Use your personal URL from QuoteDesk → Connect & settings, e.g. /mcp/<your-key>' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // No OAuth: tell clients so cleanly.
  if (path.startsWith('/.well-known/')) return new Response('Not found', { status: 404 });
  if (path === '/health') return new Response('ok');

  // ---- public pages ----
  if (path === '/' && method === 'GET') {
    const acc = await getSessionAccount(env.DB, request);
    return acc ? redirect('/app') : html(landingPage());
  }

  // Demo credentials are shared in the submission, not printed on the login page (set SHOW_DEMO_LOGIN = "true" to show them).
  const demo = env.SHOW_DEMO_LOGIN === 'true' && env.DEMO_EMAIL ? { email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD } : null;

  if (path === '/login') {
    if (method === 'GET') return html(authPage('login', { demo }));
    const f = await request.formData();
    const acc = await getAccountByEmail(env.DB, f.get('email'));
    if (!(await verifyPassword(acc, String(f.get('password') || '')))) {
      return html(authPage('login', { error: 'Wrong email or password.', values: { email: f.get('email') }, demo }), 401);
    }
    const token = await createSession(env.DB, acc.id);
    return redirect('/app', { 'Set-Cookie': sessionCookie(token) });
  }

  if (path === '/signup') {
    if (method === 'GET') return html(authPage('signup'));
    const f = await request.formData();
    const values = { email: String(f.get('email') || ''), business_name: String(f.get('business_name') || '') };
    const password = String(f.get('password') || '');
    if (!values.email.includes('@') || password.length < 8 || !values.business_name.trim()) {
      return html(authPage('signup', { error: 'Enter a business name, a valid email and a password of 8+ characters.', values }), 400);
    }
    if (await getAccountByEmail(env.DB, values.email)) {
      return html(authPage('signup', { error: 'That email already has a workspace. Log in instead.', values }), 409);
    }
    const acc = await createAccount(env.DB, { ...values, password });
    const token = await createSession(env.DB, acc.id);
    return redirect('/app/settings?welcome=1', { 'Set-Cookie': sessionCookie(token) });
  }

  if (path === '/logout' && method === 'POST') {
    await destroySession(env.DB, request);
    return redirect('/', { 'Set-Cookie': sessionCookie('', 0) });
  }

  // Client-facing quote page
  const pubMatch = path.match(/^\/q\/([A-Za-z0-9]+)(\/respond)?$/);
  if (pubMatch) {
    const q = await getQuoteByPublicId(env.DB, pubMatch[1]);
    if (!q) return html(messagePage('Quote not found', 'This link may be mistyped or the quote was removed.'), 404);
    const account = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(q.account_id).first();
    const viewer = await getSessionAccount(env.DB, request);
    const isOwner = viewer && viewer.id === q.account_id;

    if (pubMatch[2] && method === 'POST') {
      // The business owner previews the page but can never accept or decline on the client's behalf.
      if (isOwner || ['accepted', 'declined', 'expired'].includes(displayStatus(q))) return redirect(`/q/${q.public_id}`);
      if (!q.first_viewed_at) await recordView(env.DB, q);
      const f = await request.formData();
      const action = f.get('action') === 'decline' ? 'decline' : 'accept';
      const name = String(f.get('name') || '').trim().slice(0, 120) || q.client_name;
      const note = String(f.get('note') || '').trim().slice(0, 500);
      const ok = await recordResponse(env.DB, q, action, name, note);
      return redirect(ok ? `/q/${q.public_id}?done=${action}` : `/q/${q.public_id}`);
    }
    if (!isOwner && !url.searchParams.get('done')) await recordView(env.DB, q);
    const fresh = await getQuoteByPublicId(env.DB, q.public_id);
    const items = await getItems(env.DB, q.id);
    const done = url.searchParams.get('done');
    const flash = done === 'accept' ? `Thank you! ${account.business_name} has been notified that you accepted.` : done === 'decline' ? 'Thanks for letting us know.' : '';
    return html(publicQuotePage(account, fresh, items, { isOwner, flash }), 200, { 'X-Robots-Tag': 'noindex' });
  }

  // ---- owner app (login required) ----
  if (path === '/app' || path.startsWith('/app/')) {
    const account = await getSessionAccount(env.DB, request);
    if (!account) return redirect('/login');

    if (path === '/app' && method === 'GET') {
      const quotes = await listQuotes(env.DB, account.id);
      const msg = url.searchParams.get('msg') || '';
      return html(dashboardPage(account, quotes, origin, msg));
    }

    if (path === '/app/new' && method === 'POST') {
      const q = await createQuote(env.DB, account, {
        title: 'New quote', client_name: 'Client name',
        items: [{ description: 'Describe the work', quantity: 1, unit_price: 0 }],
      }, 'manual');
      return redirect(`/app/q/${q.number}`);
    }

    if (path === '/app/settings') {
      if (method === 'POST') {
        const f = await request.formData();
        await updateAccount(env.DB, account.id, {
          business_name: String(f.get('business_name') || account.business_name).trim() || account.business_name,
          business_email: String(f.get('business_email') || '').trim(),
          business_phone: String(f.get('business_phone') || '').trim(),
          business_address: String(f.get('business_address') || '').trim(),
          tax_id: String(f.get('tax_id') || '').trim(),
          currency: (String(f.get('currency') || 'INR').trim().toUpperCase() || 'INR').slice(0, 3),
          default_tax_rate: toNumber(f.get('default_tax_rate'), account.default_tax_rate),
          default_terms: String(f.get('default_terms') || '').trim(),
        });
        return redirect('/app/settings?saved=1');
      }
      const fresh = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(account.id).first();
      const flash = url.searchParams.get('saved') ? 'Saved.' : url.searchParams.get('welcome') ? 'Workspace created. Connect it to Claude below.' : '';
      return html(settingsPage(fresh, origin, flash));
    }

    const qMatch = path.match(/^\/app\/q\/([A-Za-z0-9\-]+)(\/status|\/delete)?$/);
    if (qMatch) {
      const q = await getQuoteByNumber(env.DB, account.id, qMatch[1]);
      if (!q) return html(messagePage('Quote not found', 'It may have been deleted.'), 404);
      const sub = qMatch[2];

      if (sub === '/delete' && method === 'POST') {
        await deleteQuote(env.DB, q);
        return redirect(`/app?msg=${encodeURIComponent(q.number + ' deleted.')}`);
      }
      if (sub === '/status' && method === 'POST') {
        const f = await request.formData();
        const s = f.get('status');
        if ((s === 'sent' || s === 'draft') && q.status !== 'accepted' && q.status !== 'declined') await setStatus(env.DB, q, s, 'you');
        return redirect(`/app/q/${q.number}?saved=1`);
      }
      if (!sub && method === 'POST') {
        if (q.status === 'accepted' || q.status === 'declined') return redirect(`/app/q/${q.number}`);
        const f = await request.formData();
        const descs = f.getAll('item_desc');
        const qtys = f.getAll('item_qty');
        const prices = f.getAll('item_price');
        const items = cleanItems(descs.map((d, i) => ({ description: d, quantity: qtys[i], unit_price_cents: toCents(prices[i] || 0) })));
        await updateQuote(env.DB, q, {
          title: String(f.get('title') || q.title),
          client_name: String(f.get('client_name') || q.client_name),
          client_company: String(f.get('client_company') || ''),
          client_email: String(f.get('client_email') || ''),
          currency: String(f.get('currency') || q.currency),
          tax_rate: f.get('tax_rate'),
          discount_cents: toCents(f.get('discount') || 0),
          notes: String(f.get('notes') || ''),
          terms: String(f.get('terms') || ''),
          valid_until: String(f.get('valid_until') || q.valid_until),
        }, items, 'you');
        return redirect(`/app/q/${q.number}?saved=1`);
      }
      if (!sub && method === 'GET') {
        const [items, events] = await Promise.all([getItems(env.DB, q.id), getEvents(env.DB, q.id)]);
        return html(editorPage(account, q, items, events, origin, url.searchParams.get('saved') ? 'Saved.' : ''));
      }
    }
  }

  return html(messagePage('Page not found', "That page doesn't exist."), 404);
}
