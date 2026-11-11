// Password hashing (PBKDF2) and cookie sessions using the Web Crypto API.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomToken(len = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 },
    key,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(account, password) {
  if (!account) return false;
  const h = await hashPassword(password, account.salt);
  return h === account.password_hash;
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function createSession(db, accountId) {
  const token = randomToken(32);
  await db
    .prepare(`INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))`)
    .bind(token, accountId)
    .run();
  return token;
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export async function getSessionAccount(db, request) {
  const sid = parseCookies(request).sid;
  if (!sid) return null;
  return db
    .prepare(
      `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .bind(sid)
    .first();
}

export async function destroySession(db, request) {
  const sid = parseCookies(request).sid;
  if (sid) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(sid).run();
}
