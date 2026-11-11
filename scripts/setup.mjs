// One-command deploy: npm run setup
// Logs in to Cloudflare if needed, creates the database, fills in wrangler.toml, creates tables, deploys.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const run = (cmd) => spawnSync(cmd, { shell: true, stdio: 'inherit' }).status === 0;
const capture = (cmd) => {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
};
const step = (n, msg) => console.log(`\n\x1b[1m[${n}/4] ${msg}\x1b[0m`);
const fail = (msg) => {
  console.error(`\n\x1b[31mStopped: ${msg}\x1b[0m\nCopy everything above this line and send it to Claude.`);
  process.exit(1);
};

step(1, 'Checking your Cloudflare login');
if (/not authenticated|not logged in/i.test(capture('npx wrangler whoami').out)) {
  console.log('A browser window will open. Log in or sign up to Cloudflare, then click Allow.');
  if (!run('npx wrangler login')) fail('Cloudflare login did not finish.');
}

step(2, 'Creating the database (skipped if it already exists)');
const findDb = () => {
  const { out } = capture('npx wrangler d1 list --json');
  try {
    const list = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
    return list.find((d) => d.name === 'quotedesk');
  } catch {
    return null;
  }
};
let db = findDb();
if (!db) {
  if (!run('npx wrangler d1 create quotedesk --location apac --no-update-config')) fail('Could not create the database.');
  db = findDb();
}
if (!db || !db.uuid) fail('Database was created but its id could not be read.');
const toml = readFileSync('wrangler.toml', 'utf8').replace(/database_id = "[^"]*"/, `database_id = "${db.uuid}"`);
writeFileSync('wrangler.toml', toml);
console.log(`Database ready (id ${db.uuid}), saved into wrangler.toml.`);

step(3, 'Creating the tables');
if (!run('npx wrangler d1 execute quotedesk --remote --file=schema.sql -y')) fail('Could not create the tables.');

step(4, 'Putting the app live');
console.log('If it asks you to pick a workers.dev subdomain, type any short name (for example your name) and press Enter.');
if (!run('npx wrangler deploy')) fail('Deploy did not finish.');

console.log(`
\x1b[32m\x1b[1mDone. QuoteDesk is live.\x1b[0m
Look a few lines up for the address ending in .workers.dev. That is YOUR-URL.
  App login:   YOUR-URL/login   (demo@quotedesk.app / volopay-demo)
  MCP URL:     YOUR-URL/mcp/demo-volopay
Test it:  npm run test:mcp -- YOUR-URL/mcp/demo-volopay
`);
