// Data layer for QuoteDesk. Plain SQL on Cloudflare D1, no AI anywhere.
import { hashPassword, randomToken } from './auth.js';

export const STATUSES = ['draft', 'sent', 'accepted', 'declined'];

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toCents(value) {
  const n = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.\-]/g, '')) : Number(value);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toNumber(value, fallback = 0) {
  const n = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.\-]/g, '')) : Number(value);
  return isFinite(n) ? n : fallback;
}

export function formatMoney(cents, currency = 'INR') {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: (cents || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 }).format((cents || 0) / 100);
  } catch {
    return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

export function computeTotals(items, taxRate = 0, discountCents = 0) {
  const lines = items.map((it) => Math.round((Number(it.quantity) || 0) * (Number(it.unit_price_cents) || 0)));
  const subtotal = lines.reduce((a, b) => a + b, 0);
  const discount = Math.min(Math.max(0, discountCents || 0), subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * (Number(taxRate) || 0)) / 100);
  return { lines, subtotal, discount, taxable, tax, total: taxable + tax };
}

// Status shown to people: adds "viewed" and "expired" on top of the stored status.
export function displayStatus(q) {
  if (q.status === 'accepted' || q.status === 'declined') return q.status;
  if (q.valid_until && q.valid_until < today()) return 'expired';
  if (q.status === 'sent' && q.view_count > 0) return 'viewed';
  return q.status;
}

// ---------- accounts ----------

export async function createAccount(db, { email, password, business_name, mcp_key }) {
  const salt = randomToken(16);
  const password_hash = await hashPassword(password, salt);
  const key = mcp_key || 'qd_' + randomToken(24);
  return db
    .prepare(
      `INSERT INTO accounts (email, password_hash, salt, business_name, business_email, mcp_key, default_terms)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .bind(
      email.trim().toLowerCase(),
      password_hash,
      salt,
      business_name.trim(),
      email.trim().toLowerCase(),
      key,
      '50% advance to start work, balance on delivery. Prices valid until the date shown.'
    )
    .first();
}

export async function ensureDemo(env) {
  if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) return;
  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(env.DEMO_EMAIL).first();
  if (existing) return;
  const acc = await createAccount(env.DB, {
    email: env.DEMO_EMAIL,
    password: env.DEMO_PASSWORD,
    business_name: env.DEMO_BUSINESS || 'Demo Studio',
    mcp_key: env.DEMO_MCP_KEY || undefined,
  });
  await env.DB.prepare(
    `UPDATE accounts SET business_phone = ?, business_address = ?, tax_id = ? WHERE id = ?`
  )
    .bind('+91 98765 43210', 'Road No. 10, Jubilee Hills, Hyderabad 500033', '36ABCDE1234F1Z5', acc.id)
    .run();
}

export function getAccountByEmail(db, email) {
  return db.prepare('SELECT * FROM accounts WHERE email = ?').bind(String(email || '').trim().toLowerCase()).first();
}

export function getAccountById(db, id) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
}

export function getAccountByMcpKey(db, key) {
  return db.prepare('SELECT * FROM accounts WHERE mcp_key = ?').bind(key).first();
}

export async function updateAccount(db, id, f) {
  await db
    .prepare(
      `UPDATE accounts SET business_name = ?, business_email = ?, business_phone = ?, business_address = ?,
       tax_id = ?, currency = ?, default_tax_rate = ?, default_terms = ? WHERE id = ?`
    )
    .bind(
      f.business_name, f.business_email, f.business_phone, f.business_address,
      f.tax_id, f.currency, f.default_tax_rate, f.default_terms, id
    )
    .run();
}

// ---------- quotes ----------

export function normalizeNumber(input) {
  const digits = String(input || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  return 'Q-' + String(parseInt(digits, 10)).padStart(4, '0');
}

export function cleanItems(rawItems) {
  return (rawItems || [])
    .map((it) => ({
      description: String(it.description || '').trim(),
      quantity: toNumber(it.quantity, 1),
      unit_price_cents: it.unit_price_cents != null ? Math.round(Number(it.unit_price_cents)) : toCents(it.unit_price),
    }))
    .filter((it) => it.description.length > 0);
}

export async function createQuote(db, account, data, source = 'manual') {
  const row = await db
    .prepare('UPDATE accounts SET next_quote_no = next_quote_no + 1 WHERE id = ? RETURNING next_quote_no - 1 AS n')
    .bind(account.id)
    .first();
  const number = 'Q-' + String(row.n).padStart(4, '0');
  const publicId = randomToken(10);
  const validDays = Math.max(1, Math.min(365, parseInt(data.valid_for_days, 10) || 15));
  const quote = await db
    .prepare(
      `INSERT INTO quotes (account_id, number, public_id, title, client_name, client_company, client_email,
        currency, tax_rate, discount_cents, notes, terms, valid_until, status, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?) RETURNING *`
    )
    .bind(
      account.id,
      number,
      publicId,
      String(data.title || 'Untitled quote').trim(),
      String(data.client_name || 'New client').trim(),
      String(data.client_company || '').trim(),
      String(data.client_email || '').trim(),
      String(data.currency || account.currency || 'INR').toUpperCase().slice(0, 3),
      data.tax_rate_percent != null ? toNumber(data.tax_rate_percent, 0) : account.default_tax_rate,
      toCents(data.discount || 0),
      String(data.notes || '').trim(),
      String(data.terms != null ? data.terms : account.default_terms || '').trim(),
      data.valid_until || addDays(today(), validDays),
      source
    )
    .first();
  const items = cleanItems(data.items);
  await replaceItems(db, quote.id, items);
  await addEvent(db, quote.id, 'created', source === 'claude' ? 'Drafted by Claude via MCP' : 'Created in QuoteDesk');
  return quote;
}

export async function replaceItems(db, quoteId, items) {
  const stmts = [db.prepare('DELETE FROM quote_items WHERE quote_id = ?').bind(quoteId)];
  items.forEach((it, i) => {
    stmts.push(
      db
        .prepare('INSERT INTO quote_items (quote_id, position, description, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)')
        .bind(quoteId, i, it.description, it.quantity, it.unit_price_cents)
    );
  });
  await db.batch(stmts);
}

export function getQuoteByNumber(db, accountId, number) {
  const n = normalizeNumber(number);
  if (!n) return null;
  return db.prepare('SELECT * FROM quotes WHERE account_id = ? AND number = ?').bind(accountId, n).first();
}

export function getQuoteByPublicId(db, publicId) {
  return db.prepare('SELECT * FROM quotes WHERE public_id = ?').bind(publicId).first();
}

export async function getItems(db, quoteId) {
  const { results } = await db.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY position').bind(quoteId).all();
  return results;
}

export async function getEvents(db, quoteId) {
  const { results } = await db
    .prepare('SELECT * FROM quote_events WHERE quote_id = ? ORDER BY created_at DESC, id DESC LIMIT 30')
    .bind(quoteId)
    .all();
  return results;
}

export function addEvent(db, quoteId, type, detail = '') {
  return db.prepare('INSERT INTO quote_events (quote_id, type, detail) VALUES (?, ?, ?)').bind(quoteId, type, detail).run();
}

const EDITABLE = ['title', 'client_name', 'client_company', 'client_email', 'currency', 'tax_rate', 'discount_cents', 'notes', 'terms', 'valid_until'];

export async function updateQuote(db, quote, fields, items, actor = 'you') {
  const sets = [];
  const vals = [];
  const changed = [];
  for (const k of EDITABLE) {
    if (fields[k] === undefined) continue;
    let v = fields[k];
    if (k === 'tax_rate') v = toNumber(v, quote.tax_rate);
    if (k === 'discount_cents') v = Math.max(0, Math.round(Number(v) || 0));
    if (k === 'currency') v = String(v).toUpperCase().slice(0, 3);
    if (typeof v === 'string') v = v.trim();
    if (v !== quote[k]) {
      sets.push(`${k} = ?`);
      vals.push(v);
      changed.push(k.replace('_cents', '').replace(/_/g, ' '));
    }
  }
  if (items) {
    const before = (await getItems(db, quote.id)).map((i) => [i.description, Number(i.quantity), i.unit_price_cents]);
    const after = items.map((i) => [i.description, Number(i.quantity), i.unit_price_cents]);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await replaceItems(db, quote.id, items);
      changed.push('line items');
    }
  }
  sets.push(`updated_at = datetime('now')`);
  await db.prepare(`UPDATE quotes SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, quote.id).run();
  if (changed.length) {
    await addEvent(db, quote.id, 'edited', `Edited by ${actor}: ${[...new Set(changed)].join(', ')}`);
  }
  return db.prepare('SELECT * FROM quotes WHERE id = ?').bind(quote.id).first();
}

export async function setStatus(db, quote, status, actor = 'you') {
  if (!STATUSES.includes(status)) throw new Error('Unknown status ' + status);
  const sentAt = status === 'sent' && !quote.sent_at ? `, sent_at = datetime('now')` : '';
  await db.prepare(`UPDATE quotes SET status = ?, updated_at = datetime('now')${sentAt} WHERE id = ?`).bind(status, quote.id).run();
  await addEvent(db, quote.id, 'status', `Marked as ${status} by ${actor}`);
}

export async function recordView(db, quote) {
  await db
    .prepare(
      `UPDATE quotes SET view_count = view_count + 1, last_viewed_at = datetime('now'),
       first_viewed_at = COALESCE(first_viewed_at, datetime('now')),
       status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
       sent_at = COALESCE(sent_at, datetime('now')) WHERE id = ?`
    )
    .bind(quote.id)
    .run();
  if (quote.status === 'draft') await addEvent(db, quote.id, 'status', 'Marked as sent: client link was opened');
  if (!quote.first_viewed_at) await addEvent(db, quote.id, 'viewed', 'Client opened the quote for the first time');
}

export async function recordResponse(db, quote, action, name, note) {
  const status = action === 'accept' ? 'accepted' : 'declined';
  // Only the first response counts: a double click or a second tab changes nothing.
  const r = await db
    .prepare(
      `UPDATE quotes SET status = ?, responded_at = datetime('now'), responder_name = ?, response_note = ?,
       updated_at = datetime('now') WHERE id = ? AND status NOT IN ('accepted', 'declined')
       AND (valid_until IS NULL OR valid_until >= date('now'))`
    )
    .bind(status, name, note, quote.id)
    .run();
  if (!r.meta || r.meta.changes !== 1) return false;
  await addEvent(db, quote.id, status, `${status === 'accepted' ? 'Accepted' : 'Declined'} by ${name}${note ? ': "' + note + '"' : ''}`);
  return true;
}

export async function deleteQuote(db, quote) {
  await db.batch([
    db.prepare('DELETE FROM quote_items WHERE quote_id = ?').bind(quote.id),
    db.prepare('DELETE FROM quote_events WHERE quote_id = ?').bind(quote.id),
    db.prepare('DELETE FROM quotes WHERE id = ?').bind(quote.id),
  ]);
}

// Quotes with totals computed in one pass (small per-account data, so this stays cheap).
export async function listQuotes(db, accountId, { status = 'all', limit = 100 } = {}) {
  const { results: quotes } = await db
    .prepare('SELECT * FROM quotes WHERE account_id = ? ORDER BY id DESC LIMIT ?')
    .bind(accountId, limit)
    .all();
  if (!quotes.length) return [];
  const ids = quotes.map((q) => q.id);
  const { results: items } = await db
    .prepare(`SELECT quote_id, quantity, unit_price_cents FROM quote_items WHERE quote_id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all();
  const byQuote = {};
  for (const it of items) (byQuote[it.quote_id] ||= []).push(it);
  const out = quotes.map((q) => ({
    ...q,
    display_status: displayStatus(q),
    totals: computeTotals(byQuote[q.id] || [], q.tax_rate, q.discount_cents),
  }));
  if (status && status !== 'all') return out.filter((q) => q.display_status === status || q.status === status);
  return out;
}
