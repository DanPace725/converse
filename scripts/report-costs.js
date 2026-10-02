import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { conversationCosts, costRecord } from './lib/costs.js';
import { latestExports } from './report-conversations.js';
const here = fileURLToPath(new URL('.', import.meta.url));
export const prices = JSON.parse(readFileSync(resolve(here, '../docs/model-costs-2026-10-02.json'), 'utf8'));
const escape = v => String(v ?? 'unknown').replaceAll('|', '\\|').replaceAll('\n', ' ');
const usd = n => n == null ? 'unknown' : '$' + n.toFixed(6);
export function costMarkdown(report) {
  return `# Cost and context: ${report.id}\n\nExport: ${report.exported_at}. Rates checked ${report.price_date}; ${report.basis}.\n\n`
    + `Working context: ${report.context.working_characters.toLocaleString()} characters / ${report.context.history_characters.toLocaleString()} history characters (${((report.context.reduction_fraction || 0) * 100).toFixed(1)}% reduction). This is saved text size, not transmitted tokens.\n\n`
    + (report.context.measurement_note ? report.context.measurement_note + '.\n\n' : '')
    + `Known valuation: **${usd(report.known_usd_min)}–${usd(report.known_usd_max)}**; ${report.priced_calls}/${report.calls.length} priced calls. Unpriced calls are excluded, never valued at zero. Partial usage remains included.\n\n`
    + '| Purpose | Calls | Priced | Known USD range |\n|---|---:|---:|---|\n'
    + Object.entries(report.purpose).map(([p, v]) => `| ${escape(p)} | ${v.calls} | ${v.priced_calls} | ${usd(v.known_usd_min)}–${usd(v.known_usd_max)} |`).join('\n')
    + '\n\n| Seq | Purpose | Provider | Requested / reported model | Input | Reads | Writes | Output | USD range | Status / uncertainty |\n|---:|---|---|---|---:|---:|---:|---:|---|---|\n'
    + report.calls.map(c => `| ${c.seq} | ${escape(c.purpose)} | ${c.provider} | ${escape(c.requested_model)} / ${escape(c.reported_model)} | ${c.counts?.input ?? 'unknown'} | ${c.counts?.read ?? 'unknown'} | ${c.counts?.write ?? 'unknown'} | ${c.counts?.output ?? 'unknown'} | ${usd(c.usd_min)}–${usd(c.usd_max)} | ${escape([c.status, ...c.reasons].join('; '))} |`).join('\n') + '\n';
}
export function generateCostReports(directory) {
  const base = resolve(directory), records = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.json')) {
        try { const record = costRecord(JSON.parse(readFileSync(path, 'utf8'))); if ((record.context_layer || record).events && record.conversation_id) records.push({ record, path }); } catch { /* Ignore non-export files. */ }
      }
    }
  }
  walk(base);
  const output = join(base, 'cost-reports'); mkdirSync(output, { recursive: true });
  const latest = latestExports(records).map(({ record, path }) => ({ ...conversationCosts(record, prices), source: relative(base, path) }));
  const trends = records.map(({ record, path }) => ({ ...conversationCosts(record, prices), source: relative(base, path), calls: undefined })).sort((a, b) => String(a.exported_at).localeCompare(String(b.exported_at)));
  for (const report of latest) writeFileSync(join(output, report.id + '.md'), costMarkdown(report));
  const data = { generated_at: new Date().toISOString(), price_snapshot: prices, conversations: latest, snapshots: trends };
  writeFileSync(join(output, 'costs.json'), JSON.stringify(data, null, 2) + '\n');
  writeFileSync(join(output, 'index.md'), '# Conversation cost and context report\n\nCurrent public-rate valuation, not an invoice. Snapshot history remains in costs.json; cumulative snapshots must not be added together.\n\n| Conversation | Context reduction | Priced calls | Known USD range |\n|---|---:|---:|---|\n' + latest.map(r => `| [${r.id}](${r.id}.md) | ${((r.context.reduction_fraction || 0) * 100).toFixed(1)}% | ${r.priced_calls}/${r.calls.length} | ${usd(r.known_usd_min)}–${usd(r.known_usd_max)} |`).join('\n') + '\n');
  return data;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const data = generateCostReports(process.argv[2] || resolve(here, '../docs/conversations'));
  console.log(`Cost reports: ${data.conversations.length} conversations, ${data.snapshots.length} export snapshots`);
}
