// Smoke test with the official MCP SDK client.
// Usage: node scripts/test-mcp.mjs https://your-app.workers.dev/mcp/demo-volopay
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2] || 'http://localhost:8787/mcp/demo-volopay';
const client = new Client({ name: 'quotedesk-smoke-test', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
console.log('Connected:', client.getServerVersion());

const { tools } = await client.listTools();
console.log('Tools:', tools.map((t) => t.name).join(', '));

const show = (r) => console.log('\n' + r.content.map((c) => c.text).join('\n') + (r.isError ? '  [isError]' : ''));

show(await client.callTool({ name: 'get_business_profile', arguments: {} }));

const created = await client.callTool({
  name: 'create_quote',
  arguments: {
    title: 'Brand refresh + Instagram launch',
    client_name: 'Riya Sharma',
    client_company: 'Bloom Cafe',
    items: [
      { description: 'Logo redesign (3 concepts, 2 revision rounds)', quantity: 1, unit_price: 25000 },
      { description: 'Menu design, print-ready (2 pages)', quantity: 2, unit_price: 6000 },
      { description: 'Instagram setup + 12 launch posts', quantity: 1, unit_price: 18000 },
    ],
    discount: 3000,
    notes: 'Timeline: 3 weeks from advance.\nIncludes source files.\nPrinting not included.',
  },
});
show(created);
const number = created.content[0].text.match(/Q-\d{4}/)[0];

show(await client.callTool({ name: 'update_quote', arguments: { quote_number: number, discount: 0, valid_until: '2026-12-31' } }));
show(await client.callTool({ name: 'list_quotes', arguments: { status: 'all' } }));
show(await client.callTool({ name: 'get_quote', arguments: { quote_number: number } }));
show(await client.callTool({ name: 'get_quote', arguments: { quote_number: 'Q-9999' } }));
await client.close();
