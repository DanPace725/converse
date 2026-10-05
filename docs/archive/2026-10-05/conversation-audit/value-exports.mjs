// Reproduce the valuation using the repository's dated October 2 rate table.
import { readFileSync, writeFileSync } from 'node:fs';
import { conversationCosts } from '../../../../scripts/lib/costs.js';
import { prices, costMarkdown } from '../../../../scripts/report-costs.js';
const records = process.argv.slice(2).map(path => conversationCosts(JSON.parse(readFileSync(path, 'utf8')), prices));
writeFileSync(new URL('costs.json', import.meta.url), JSON.stringify({ pricing_date: prices.verified_at || prices.date, conversations: records }, null, 2) + '\n');
for (const record of records) {
  writeFileSync(new URL(record.id + '-cost.md', import.meta.url), costMarkdown(record));
  console.log(JSON.stringify({ id: record.id, calls: record.calls.length, priced: record.priced_calls,
    min: record.known_usd_min, max: record.known_usd_max, purpose: record.purpose }));
}
