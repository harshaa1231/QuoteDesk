-- QuoteDesk schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_email TEXT DEFAULT '',
  business_phone TEXT DEFAULT '',
  business_address TEXT DEFAULT '',
  tax_id TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'INR',
  default_tax_rate REAL NOT NULL DEFAULT 18,
  default_terms TEXT DEFAULT '',
  mcp_key TEXT NOT NULL UNIQUE,
  next_quote_no INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_company TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  currency TEXT NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  terms TEXT DEFAULT '',
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'manual',
  view_count INTEGER NOT NULL DEFAULT 0,
  first_viewed_at TEXT,
  last_viewed_at TEXT,
  sent_at TEXT,
  responded_at TEXT,
  responder_name TEXT,
  response_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, number)
);

CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quote_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotes_account ON quotes (account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_items_quote ON quote_items (quote_id, position);
CREATE INDEX IF NOT EXISTS idx_events_quote ON quote_events (quote_id, created_at);
