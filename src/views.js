// Server-rendered HTML for QuoteDesk. No frameworks, no AI.
import { computeTotals, formatMoney, displayStatus } from './db.js';

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00Z' : d.replace(' ', 'T') + 'Z');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d.replace(' ', 'T') + 'Z');
  return dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

const CSS = `
:root{--ink:#15171c;--ink2:#3a3e48;--muted:#6c7182;--line:#e6e7eb;--bg:#f6f6f3;--card:#fff;
--accent:#1d6b57;--accent-ink:#fff;--accent-soft:#e7f3ee;--warn:#9a5b00;--warn-soft:#fdf3e1;--bad:#a8322d;--bad-soft:#fbecea;
--blue:#2c5cc5;--blue-soft:#eaf0fc;--r:12px;--shadow:0 1px 2px rgba(20,22,28,.04),0 4px 16px rgba(20,22,28,.05)}
*{box-sizing:border-box}html,body{margin:0}
body{font:15px/1.5 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Manrope","Inter",system-ui,sans-serif;letter-spacing:-.02em;margin:0 0 .4em}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.nav{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.nav .wrap{display:flex;align-items:center;gap:18px;height:60px}
.brand{display:flex;align-items:center;gap:9px;font-family:Manrope,sans-serif;font-weight:800;font-size:18px;color:var(--ink);letter-spacing:-.02em}
.brand:hover{text-decoration:none}
.mark{width:26px;height:26px;border-radius:7px;background:var(--accent);display:grid;place-items:center;color:#fff;font-size:14px;font-weight:800}
.nav .links{display:flex;gap:4px;margin-left:12px}
.nav .links a{color:var(--ink2);padding:6px 10px;border-radius:8px;font-weight:500}
.nav .links a.on,.nav .links a:hover{background:var(--bg);text-decoration:none;color:var(--ink)}
.nav .right{margin-left:auto;display:flex;align-items:center;gap:12px;color:var(--muted);font-size:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:var(--card);color:var(--ink);
padding:9px 14px;border-radius:10px;font:600 14px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
.btn:hover{border-color:#cfd1d8;text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.btn.primary:hover{filter:brightness(1.07)}
.btn.ghost{background:transparent;border-color:transparent;color:var(--muted)}.btn.ghost:hover{color:var(--ink)}
.btn.danger{color:var(--bad)}.btn.sm{padding:6px 10px;font-size:13px}.btn.block{width:100%}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.pad{padding:20px}
.muted{color:var(--muted)}.small{font-size:13px}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.chip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:600;text-transform:capitalize;background:var(--bg);color:var(--ink2);border:1px solid var(--line)}
.chip.draft{background:#f1f1ef;color:#5d606b}
.chip.sent{background:var(--blue-soft);color:var(--blue);border-color:#d6e1f8}
.chip.viewed{background:var(--warn-soft);color:var(--warn);border-color:#f5e2bd}
.chip.accepted{background:var(--accent-soft);color:var(--accent);border-color:#cbe6db}
.chip.declined,.chip.expired{background:var(--bad-soft);color:var(--bad);border-color:#f2d3cf}
.chip.claude{background:#f4eefc;color:#6a3fb5;border-color:#e6dbf7;text-transform:none}
label{display:block;font-size:13px;font-weight:600;color:var(--ink2);margin:0 0 5px}
input,textarea,select{width:100%;font:inherit;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 11px;outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
textarea{min-height:90px;resize:vertical}
.field{margin-bottom:14px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.flash{padding:10px 14px;border-radius:10px;margin:0 0 16px;font-size:14px}
.flash.ok{background:var(--accent-soft);color:var(--accent)}.flash.err{background:var(--bad-soft);color:var(--bad)}
table{width:100%;border-collapse:collapse}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);text-align:left;font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:28px 0 18px;flex-wrap:wrap}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.stat .k{font-size:13px;color:var(--muted)}.stat .v{font:800 24px/1.2 Manrope,sans-serif;margin-top:4px;letter-spacing:-.02em}
.rowlink{cursor:pointer}.rowlink:hover td{background:#fafaf8}
.empty{text-align:center;padding:48px 20px}
.editor{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start;margin-bottom:40px}
.items td{padding:8px 6px}.items input{padding:8px 9px}
.items .del{border:0;background:none;color:var(--muted);cursor:pointer;font-size:18px;padding:6px}
.totals{margin-left:auto;max-width:320px;padding-top:6px}
.totals div{display:flex;justify-content:space-between;padding:4px 0;font-variant-numeric:tabular-nums}
.totals .grand{border-top:1px solid var(--line);margin-top:6px;padding-top:10px;font:800 18px Manrope,sans-serif}
.side>.card{margin-bottom:14px}
.copy{display:flex;gap:6px}.copy input{font-size:12px;font-family:ui-monospace,Menlo,monospace}
.timeline{list-style:none;margin:0;padding:0}
.timeline li{padding:8px 0 8px 16px;border-left:2px solid var(--line);position:relative;font-size:13px}
.timeline li:before{content:"";position:absolute;left:-5px;top:13px;width:8px;height:8px;border-radius:50%;background:var(--line)}
.timeline li.accepted:before{background:var(--accent)}.timeline li.viewed:before{background:#e0a33a}.timeline li.created:before{background:#8a63d2}
.footer{color:var(--muted);font-size:13px;text-align:center;padding:30px 0}
@media (max-width:860px){.editor{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.grid3{grid-template-columns:1fr 1fr}
.nav .right .who{display:none}.hide-sm{display:none}}
@media (max-width:520px){.grid2,.grid3{grid-template-columns:1fr}}
`;

function head(title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@700;800&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%231d6b57'/><text x='16' y='22' font-size='17' text-anchor='middle' fill='white' font-family='Arial' font-weight='700'>Q</text></svg>">
<style>${CSS}</style></head>`;
}

const brand = `<a class="brand" href="/"><span class="mark">Q</span>QuoteDesk</a>`;

function appShell(title, account, active, body) {
  return `${head(title + ' · QuoteDesk')}<body>
<nav class="nav"><div class="wrap">${brand}
<div class="links"><a href="/app" class="${active === 'quotes' ? 'on' : ''}">Quotes</a><a href="/app/settings" class="${active === 'settings' ? 'on' : ''}">Connect &amp; settings</a></div>
<div class="right"><span class="who">${esc(account.business_name)}</span>
<form method="post" action="/logout" style="margin:0"><button class="btn ghost sm">Log out</button></form></div></div></nav>
<main class="wrap">${body}</main></body></html>`;
}

// ---------- marketing + auth ----------

export function landingPage() {
  return `${head('QuoteDesk · Quotes your clients can accept, written by your Claude')}<body>
<nav class="nav"><div class="wrap">${brand}<div class="right"><a href="/login" class="btn ghost">Log in</a><a href="/signup" class="btn primary">Start free</a></div></div></nav>
<main class="wrap">
<section style="padding:64px 0 36px;max-width:760px">
<span class="chip claude">Works inside Claude via MCP</span>
<h1 style="font-size:46px;line-height:1.08;margin-top:16px">Turn a client's WhatsApp message into a quote they can accept, in one minute.</h1>
<p style="font-size:18px;color:var(--ink2);max-width:640px">Paste the requirement into Claude. Your Claude writes the line items, scope and pricing and sends it to QuoteDesk. You tweak it, share one link, and see the moment your client opens it and clicks Accept.</p>
<div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap"><a href="/signup" class="btn primary">Create free workspace</a><a href="/login" class="btn">Try the demo</a></div>
</section>
<section class="grid3" style="margin-bottom:28px">
<div class="card pad"><div class="muted small">1 · In Claude</div><h3>Describe the job</h3><p class="muted">"Client wants a 5-page site and 3 months of SEO, budget about 2 lakh." Claude drafts the quote.</p></div>
<div class="card pad"><div class="muted small">2 · In QuoteDesk</div><h3>Review and share</h3><p class="muted">Edit prices or scope, then send your client one clean link. GST, numbering and validity handled.</p></div>
<div class="card pad"><div class="muted small">3 · Your client</div><h3>Opens and accepts</h3><p class="muted">You see when they open it and when they accept. Claude can tell you who went quiet and draft the follow-up.</p></div>
</section>
<section class="card pad" style="margin-bottom:28px">
<h2>Why not just ask Claude?</h2>
<div class="grid3"><div><b>Claude can't host a link.</b><p class="muted">Your client needs a page to open, not a chat transcript.</p></div>
<div><b>Claude can't record a yes.</b><p class="muted">QuoteDesk keeps a timestamped acceptance with the client's name.</p></div>
<div><b>Claude forgets after the chat.</b><p class="muted">QuoteDesk keeps every quote, its status and who opened it, so nothing slips.</p></div></div>
</section>
<section style="margin-bottom:20px"><h2>Pricing</h2>
<div class="grid3">
<div class="card pad"><h3>Free</h3><div class="stat"><div class="v">₹0</div></div><p class="muted">5 quotes a month. "Sent with QuoteDesk" footer.</p></div>
<div class="card pad" style="border-color:var(--accent)"><h3>Pro</h3><div class="stat"><div class="v">₹499<span class="muted small"> /month</span></div></div><p class="muted">Unlimited quotes, your logo, no footer, view alerts.</p></div>
<div class="card pad"><h3>Team</h3><div class="stat"><div class="v">₹1,499<span class="muted small"> /month</span></div></div><p class="muted">5 seats, shared pipeline, approval before sending.</p></div>
</div></section>
<p class="footer">No AI runs inside QuoteDesk. The thinking happens in your own Claude plan.</p>
</main></body></html>`;
}

export function authPage(mode, { error = '', values = {}, demo = null } = {}) {
  const isSignup = mode === 'signup';
  return `${head((isSignup ? 'Create workspace' : 'Log in') + ' · QuoteDesk')}<body>
<nav class="nav"><div class="wrap">${brand}</div></nav>
<main class="wrap" style="max-width:420px;padding-top:48px">
<div class="card pad">
<h2>${isSignup ? 'Create your workspace' : 'Log in'}</h2>
<p class="muted small">${isSignup ? 'Free, takes 20 seconds. You get your own Claude connector link.' : 'Welcome back.'}</p>
${error ? `<div class="flash err">${esc(error)}</div>` : ''}
<form method="post" action="/${mode}">
${isSignup ? `<div class="field"><label>Business name</label><input name="business_name" required value="${esc(values.business_name)}" placeholder="Acme Design Studio"></div>` : ''}
<div class="field"><label>Email</label><input name="email" type="email" required value="${esc(values.email)}"></div>
<div class="field"><label>Password</label><input name="password" type="password" required minlength="${isSignup ? 8 : 1}"></div>
<button class="btn primary block">${isSignup ? 'Create workspace' : 'Log in'}</button>
</form>
<p class="small muted" style="margin-top:14px">${isSignup ? 'Already have one? <a href="/login">Log in</a>' : 'New here? <a href="/signup">Create a workspace</a>'}</p>
</div>
${!isSignup && demo ? `<div class="card pad" style="margin-top:14px"><b>Demo account</b><p class="small muted" style="margin:6px 0 0">Email <span class="mono">${esc(demo.email)}</span> · Password <span class="mono">${esc(demo.password)}</span></p></div>` : ''}
</main></body></html>`;
}

// ---------- dashboard ----------

export function dashboardPage(account, quotes, origin, flash = '') {
  const cur = account.currency;
  const open = quotes.filter((q) => ['sent', 'viewed', 'draft'].includes(q.display_status));
  const won = quotes.filter((q) => q.status === 'accepted');
  const decided = quotes.filter((q) => q.status === 'accepted' || q.status === 'declined');
  const waiting = quotes.filter((q) => q.display_status === 'viewed');
  const sum = (arr) => arr.filter((q) => q.currency === cur).reduce((a, q) => a + q.totals.total, 0);
  const winRate = decided.length ? Math.round((won.length / decided.length) * 100) + '%' : '—';

  const rows = quotes
    .map(
      (q) => `<tr class="rowlink" onclick="location.href='/app/q/${esc(q.number)}'">
<td><a href="/app/q/${esc(q.number)}"><b>${esc(q.number)}</b></a>${q.source === 'claude' ? ' <span class="chip claude">by Claude</span>' : ''}</td>
<td><div><b>${esc(q.title)}</b></div><div class="small muted">${esc(q.client_name)}${q.client_company ? ' · ' + esc(q.client_company) : ''}</div></td>
<td><span class="chip ${esc(q.display_status)}">${esc(q.display_status)}</span>${q.view_count ? `<div class="small muted" style="margin-top:4px">opened ${q.view_count}×</div>` : ''}</td>
<td class="num"><b>${formatMoney(q.totals.total, q.currency)}</b></td>
<td class="small muted hide-sm">${fmtDate(q.created_at)}</td></tr>`
    )
    .join('');

  const body = `
<div class="page-head"><div><h1>Quotes</h1><div class="muted">Everything your Claude drafted, plus anything you made by hand.</div></div>
<form method="post" action="/app/new" style="margin:0"><button class="btn">+ New quote by hand</button></form></div>
${flash ? `<div class="flash ok">${esc(flash)}</div>` : ''}
<div class="stats">
<div class="card pad stat"><div class="k">Open pipeline</div><div class="v">${formatMoney(sum(open), cur)}</div></div>
<div class="card pad stat"><div class="k">Won</div><div class="v">${formatMoney(sum(won), cur)}</div></div>
<div class="card pad stat"><div class="k">Win rate</div><div class="v">${winRate}</div></div>
<div class="card pad stat"><div class="k">Opened, no reply</div><div class="v">${waiting.length}</div></div>
</div>
<div class="card">${
    quotes.length
      ? `<table><thead><tr><th>No.</th><th>Job</th><th>Status</th><th class="num">Total</th><th class="hide-sm">Created</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty"><h3>No quotes yet</h3><p class="muted">Connect QuoteDesk to Claude, then say:<br><i>"Create a quote for Riya at Bloom Cafe: logo, menu design and Instagram setup, about ₹60k."</i></p>
<a class="btn primary" href="/app/settings">Connect to Claude</a></div>`
  }</div>`;
  return appShell('Quotes', account, 'quotes', body);
}

// ---------- editor ----------

export function editorPage(account, q, items, events, origin, flash = '') {
  const t = computeTotals(items, q.tax_rate, q.discount_cents);
  const status = displayStatus(q);
  const locked = q.status === 'accepted' || q.status === 'declined';
  const clientUrl = `${origin}/q/${q.public_id}`;
  const dis = locked ? 'disabled' : '';
  const itemRow = (it) => `<tr>
<td><input name="item_desc" value="${esc(it.description)}" placeholder="What is the client paying for?" ${dis}></td>
<td style="width:70px"><input name="item_qty" value="${esc(it.quantity)}" inputmode="decimal" class="num" ${dis}></td>
<td style="width:120px"><input name="item_price" value="${esc((it.unit_price_cents || 0) / 100)}" inputmode="decimal" class="num" ${dis}></td>
<td class="num line" style="width:115px;padding-top:16px"></td>
<td style="width:36px">${locked ? '' : '<button type="button" class="del" title="Remove line">×</button>'}</td></tr>`;
  const rows = (items.length ? items : [{ description: '', quantity: 1, unit_price_cents: 0 }]).map(itemRow).join('');

  const timeline = events
    .map((e) => `<li class="${esc(e.type)}"><div>${esc(e.detail)}</div><div class="muted">${fmtDateTime(e.created_at)}</div></li>`)
    .join('');

  const body = `
<div class="page-head"><div><div class="small muted"><a href="/app">← All quotes</a></div>
<h1 style="margin-top:6px">${esc(q.number)} <span class="chip ${esc(status)}" style="vertical-align:middle">${esc(status)}</span>
${q.source === 'claude' ? '<span class="chip claude" style="vertical-align:middle">drafted by Claude</span>' : ''}</h1></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="${esc(clientUrl)}" target="_blank" rel="noopener">Preview client view ↗</a>
${locked ? '' : '<button class="btn primary" form="qform">Save changes</button>'}</div></div>
${flash ? `<div class="flash ok">${esc(flash)}</div>` : ''}
${locked ? `<div class="flash ${q.status === 'accepted' ? 'ok' : 'err'}">${q.status === 'accepted' ? 'Accepted' : 'Declined'} by <b>${esc(q.responder_name)}</b> on ${fmtDateTime(q.responded_at)}${q.response_note ? ` — "${esc(q.response_note)}"` : ''}. This quote is now locked.</div>` : ''}
<div class="editor">
<form id="qform" method="post" action="/app/q/${esc(q.number)}" class="card pad">
<div class="field"><label>Job title</label><input name="title" value="${esc(q.title)}" required ${dis}></div>
<div class="grid3">
<div class="field"><label>Client name</label><input name="client_name" value="${esc(q.client_name)}" required ${dis}></div>
<div class="field"><label>Company</label><input name="client_company" value="${esc(q.client_company)}" ${dis}></div>
<div class="field"><label>Client email</label><input name="client_email" type="email" value="${esc(q.client_email)}" ${dis}></div>
</div>
<label style="margin-top:6px">Line items</label>
<div style="overflow-x:auto"><table class="items"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th></th></tr></thead>
<tbody id="rows">${rows}</tbody></table></div>
${locked ? '' : '<button type="button" class="btn sm" id="addrow" style="margin:8px 0 14px">+ Add line</button>'}
<div class="grid3" style="margin-top:6px">
<div class="field"><label>Currency</label><input name="currency" value="${esc(q.currency)}" maxlength="3" ${dis}></div>
<div class="field"><label>Tax rate (%)</label><input name="tax_rate" id="tax" value="${esc(q.tax_rate)}" inputmode="decimal" ${dis}></div>
<div class="field"><label>Discount (flat)</label><input name="discount" id="disc" value="${esc(q.discount_cents / 100)}" inputmode="decimal" ${dis}></div>
</div>
<div class="totals" id="totals"></div>
<div class="field" style="margin-top:14px"><label>Scope &amp; notes (client sees this)</label><textarea name="notes" rows="6" ${dis}>${esc(q.notes)}</textarea></div>
<div class="grid2">
<div class="field"><label>Payment terms</label><textarea name="terms" rows="3" ${dis}>${esc(q.terms)}</textarea></div>
<div class="field"><label>Valid until</label><input name="valid_until" type="date" value="${esc(q.valid_until)}" ${dis}></div>
</div>
</form>
<aside class="side">
<div class="card pad"><h3 style="font-size:16px">Share with your client</h3>
<div class="copy"><input id="share" readonly value="${esc(clientUrl)}"><button type="button" class="btn sm" id="copybtn">Copy</button></div>
<p class="small muted" style="margin:8px 0 0">${q.view_count ? `Opened ${q.view_count}× · last ${fmtDateTime(q.last_viewed_at)}` : 'Not opened yet. Opening the link marks it as sent.'}</p>
${!locked ? `<form method="post" action="/app/q/${esc(q.number)}/status" style="margin-top:12px">
<input type="hidden" name="status" value="${q.status === 'draft' ? 'sent' : 'draft'}">
<button class="btn sm block">${q.status === 'draft' ? 'Mark as sent' : 'Move back to draft'}</button></form>` : ''}
</div>
<div class="card pad"><h3 style="font-size:16px">Total</h3><div style="font:800 26px Manrope,sans-serif" id="sidetotal">${formatMoney(t.total, q.currency)}</div>
<div class="small muted">Valid until ${fmtDate(q.valid_until)}</div></div>
<div class="card pad"><h3 style="font-size:16px">Activity</h3><ul class="timeline">${timeline}</ul></div>
<form method="post" action="/app/q/${esc(q.number)}/delete" onsubmit="return confirm('Delete ${esc(q.number)} permanently?')"><button class="btn ghost danger sm">Delete quote</button></form>
</aside></div>
<script>
(function(){
var cur=${JSON.stringify(q.currency)};
function fmt(n){try{return new Intl.NumberFormat(cur==='INR'?'en-IN':'en-US',{style:'currency',currency:(document.querySelector('[name=currency]').value||cur).toUpperCase(),minimumFractionDigits:(Math.round(n*100)%100)?2:0}).format(n)}catch(e){return n.toFixed(2)}}
function num(v){var n=parseFloat(String(v).replace(/[^0-9.\\-]/g,''));return isFinite(n)?n:0}
function recalc(){var sub=0;document.querySelectorAll('#rows tr').forEach(function(tr){var q=num(tr.querySelector('[name=item_qty]').value),p=num(tr.querySelector('[name=item_price]').value);var a=Math.round(q*p*100)/100;sub+=a;tr.querySelector('.line').textContent=fmt(a)});
var d=Math.min(num(document.getElementById('disc').value),sub),tx=Math.round((sub-d)*num(document.getElementById('tax').value))/100,tot=sub-d+tx;
document.getElementById('totals').innerHTML='<div><span>Subtotal</span><span>'+fmt(sub)+'</span></div>'+(d?'<div><span>Discount</span><span>−'+fmt(d)+'</span></div>':'')+'<div><span>Tax ('+num(document.getElementById('tax').value)+'%)</span><span>'+fmt(tx)+'</span></div><div class="grand"><span>Total</span><span>'+fmt(tot)+'</span></div>';
document.getElementById('sidetotal').textContent=fmt(tot)}
var rows=document.getElementById('rows');
rows.addEventListener('input',recalc);document.getElementById('qform').addEventListener('input',recalc);
rows.addEventListener('click',function(e){if(e.target.classList.contains('del')){var tr=e.target.closest('tr');if(rows.children.length>1)tr.remove();else tr.querySelectorAll('input').forEach(function(i){i.value=''});recalc()}});
var add=document.getElementById('addrow');if(add)add.onclick=function(){var tr=rows.children[0].cloneNode(true);tr.querySelectorAll('input').forEach(function(i){i.value=i.name==='item_qty'?'1':''});rows.appendChild(tr);tr.querySelector('input').focus();recalc()};
document.getElementById('copybtn').onclick=function(){var i=document.getElementById('share');i.select();(navigator.clipboard?navigator.clipboard.writeText(i.value):Promise.reject()).catch(function(){document.execCommand('copy')});this.textContent='Copied'};
recalc();
})();
</script>`;
  return appShell(q.number, account, 'quotes', body);
}

// ---------- settings / connect ----------

export function settingsPage(account, origin, flash = '') {
  const mcpUrl = `${origin}/mcp/${account.mcp_key}`;
  const body = `
<div class="page-head"><div><h1>Connect &amp; settings</h1><div class="muted">Plug QuoteDesk into your own Claude. Your Claude plan pays for the AI; QuoteDesk never calls any AI.</div></div></div>
${flash ? `<div class="flash ok">${esc(flash)}</div>` : ''}
<div class="editor">
<div>
<div class="card pad" style="margin-bottom:18px">
<h3>Your Claude connector URL</h3>
<div class="copy"><input id="mcp" readonly value="${esc(mcpUrl)}"><button type="button" class="btn sm" onclick="var i=document.getElementById('mcp');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);this.textContent='Copied'">Copy</button></div>
<p class="small muted">Treat this like a password: anyone with it can create quotes in your workspace.</p>
<ol style="padding-left:18px;margin:10px 0 0">
<li>In Claude (web or desktop), open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>.</li>
<li>Name it <b>QuoteDesk</b>, paste the URL above, and add it. No OAuth or headers needed.</li>
<li>In a new chat, turn QuoteDesk on from the <b>+</b> menu → Connectors.</li>
<li>Try: <i>"Create a quote for Riya at Bloom Cafe: logo, menu design and Instagram setup, about ₹60k."</i></li>
</ol></div>
<form method="post" action="/app/settings" class="card pad">
<h3>Business profile</h3><p class="small muted">Shown on every quote. Claude reads this too, so quotes match your defaults.</p>
<div class="grid2">
<div class="field"><label>Business name</label><input name="business_name" value="${esc(account.business_name)}" required></div>
<div class="field"><label>Email on quotes</label><input name="business_email" value="${esc(account.business_email)}"></div>
<div class="field"><label>Phone</label><input name="business_phone" value="${esc(account.business_phone)}"></div>
<div class="field"><label>GSTIN / tax ID</label><input name="tax_id" value="${esc(account.tax_id)}"></div>
</div>
<div class="field"><label>Address</label><input name="business_address" value="${esc(account.business_address)}"></div>
<div class="grid2">
<div class="field"><label>Default currency</label><input name="currency" value="${esc(account.currency)}" maxlength="3"></div>
<div class="field"><label>Default tax rate (%)</label><input name="default_tax_rate" value="${esc(account.default_tax_rate)}"></div>
</div>
<div class="field"><label>Default payment terms</label><textarea name="default_terms" rows="3">${esc(account.default_terms)}</textarea></div>
<button class="btn primary">Save profile</button>
</form></div>
<aside class="side"><div class="card pad"><h3 style="font-size:16px">What Claude can do here</h3>
<ul class="small" style="padding-left:18px;margin:0;color:var(--ink2)">
<li><b>create_quote</b> — draft a quote from any message</li><li><b>update_quote</b> — change price, scope or terms</li>
<li><b>list_quotes</b> — see what's open, viewed or won</li><li><b>get_quote</b> — full detail and activity</li>
<li><b>get_business_profile</b> — your defaults</li></ul>
<p class="small muted" style="margin-bottom:0">Try: <i>"Which quotes did clients open but not answer? Draft a follow-up for each."</i></p></div></aside>
</div>`;
  return appShell('Settings', account, 'settings', body);
}

// ---------- public client page ----------

export function publicQuotePage(account, q, items, { isOwner = false, flash = '' } = {}) {
  const t = computeTotals(items, q.tax_rate, q.discount_cents);
  const status = displayStatus(q);
  const decided = q.status === 'accepted' || q.status === 'declined';
  const expired = status === 'expired';
  const rows = items
    .map(
      (it, i) => `<tr><td>${esc(it.description)}</td><td class="num">${esc(it.quantity)}</td>
<td class="num">${formatMoney(it.unit_price_cents, q.currency)}</td><td class="num">${formatMoney(t.lines[i], q.currency)}</td></tr>`
    )
    .join('');
  return `${head(`${q.number} · ${q.title} · ${account.business_name}`)}<body>
<style>.doc{max-width:820px;margin:28px auto;padding:0 16px}.doc .card{padding:36px}
.dochead{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:22px}
.meta{text-align:right}.meta div{font-size:14px}
@media print{body{background:#fff}.noprint{display:none!important}.doc{margin:0;max-width:none}.doc .card{border:0;box-shadow:none;padding:0}}
@media (max-width:560px){.doc .card{padding:20px}.meta{text-align:left}.qt th:nth-child(3),.qt td:nth-child(3){display:none}.qt td,.qt th{padding:10px 6px}}</style>
<div class="doc">
${isOwner ? `<div class="flash ok noprint">You're logged in as the owner, so this visit isn't counted as a client view and you can't accept on the client's behalf. <a href="/app/q/${esc(q.number)}">Back to editor</a></div>` : ''}
${flash ? `<div class="flash ok noprint">${esc(flash)}</div>` : ''}
<div class="card">
<div class="dochead"><div><h2 style="font-size:22px">${esc(account.business_name)}</h2>
<div class="small muted">${nl2br([account.business_address, account.business_email, account.business_phone].filter(Boolean).join('\n'))}${account.tax_id ? `<br>GSTIN ${esc(account.tax_id)}` : ''}</div></div>
<div class="meta"><div class="muted small" style="text-transform:uppercase;letter-spacing:.06em">Quotation</div>
<div style="font:800 20px Manrope,sans-serif">${esc(q.number)}</div>
<div>Date: ${fmtDate(q.created_at)}</div><div>Valid until: ${fmtDate(q.valid_until)}</div>
<div style="margin-top:6px"><span class="chip ${esc(status)}">${esc(status)}</span></div></div></div>
<div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:18px">
<div><div class="muted small">Prepared for</div><b>${esc(q.client_name)}</b>${q.client_company ? `<div>${esc(q.client_company)}</div>` : ''}${q.client_email ? `<div class="small muted">${esc(q.client_email)}</div>` : ''}</div>
<div style="max-width:420px"><div class="muted small">For</div><b>${esc(q.title)}</b></div></div>
<table class="qt"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals" style="margin-top:10px">
<div><span>Subtotal</span><span>${formatMoney(t.subtotal, q.currency)}</span></div>
${t.discount ? `<div><span>Discount</span><span>−${formatMoney(t.discount, q.currency)}</span></div>` : ''}
<div><span>Tax (${esc(q.tax_rate)}%)</span><span>${formatMoney(t.tax, q.currency)}</span></div>
<div class="grand"><span>Total</span><span>${formatMoney(t.total, q.currency)}</span></div></div>
${q.notes ? `<h3 style="font-size:15px;margin-top:26px">Scope &amp; notes</h3><div style="color:var(--ink2)">${nl2br(q.notes)}</div>` : ''}
${q.terms ? `<h3 style="font-size:15px;margin-top:20px">Payment terms</h3><div style="color:var(--ink2)">${nl2br(q.terms)}</div>` : ''}
<div style="margin-top:28px;border-top:1px solid var(--line);padding-top:22px">
${
  decided
    ? `<div class="flash ${q.status === 'accepted' ? 'ok' : 'err'}" style="margin:0">${q.status === 'accepted' ? '✓ Accepted' : 'Declined'} by <b>${esc(q.responder_name)}</b> on ${fmtDateTime(q.responded_at)} IST${q.response_note ? ` — "${esc(q.response_note)}"` : ''}</div>`
    : expired
      ? `<div class="flash err" style="margin:0">This quote expired on ${fmtDate(q.valid_until)}. Please contact ${esc(account.business_name)} for an updated one.</div>`
      : isOwner
        ? `<div class="flash ok noprint" style="margin:0">Preview: your client sees <b>Accept</b> and <b>Decline</b> buttons here. Open this link in a private window to test it as the client.</div>
<button type="button" class="btn ghost noprint" style="margin-top:10px" onclick="window.print()">Download PDF</button>`
        : `<form method="post" action="/q/${esc(q.public_id)}/respond" class="noprint">
<h3 style="font-size:16px">Ready to go ahead?</h3>
<div class="grid2"><div class="field"><label>Your name</label><input name="name" required value="${esc(q.client_name)}"></div>
<div class="field"><label>Note (optional)</label><input name="note" placeholder="e.g. PO number, start date, a question"></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" name="action" value="accept">Accept quote</button>
<button class="btn" name="action" value="decline" onclick="return confirm('Decline this quote?')">Decline</button>
<button type="button" class="btn ghost" onclick="window.print()">Download PDF</button></div></form>`
}
</div></div>
<p class="footer noprint">Sent with <a href="/">QuoteDesk</a> · quotes your clients can accept</p>
</div></body></html>`;
}

export function messagePage(title, msg, code = 404) {
  return `${head(title + ' · QuoteDesk')}<body><nav class="nav"><div class="wrap">${brand}</div></nav>
<main class="wrap" style="max-width:520px;padding-top:60px;text-align:center"><h1>${esc(title)}</h1><p class="muted">${esc(msg)}</p><a class="btn" href="/">Go home</a></main></body></html>`;
}
