import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from '../lib/conclave/store.js';
import { Harness } from '../lib/conclave/harness.js';
import { anthropicPayload } from '../lib/conclave/provider.js';
import { inputSize, tokenize } from '../lib/conclave/input-size.js';
import { priceUsage } from './lib/costs.js';
import { prices } from './report-costs.js';
const directory = resolve(process.argv[2] || 'docs/conversations/Processed');
const rows = [];
for (const file of readdirSync(directory).filter(f => f.endsWith('.json'))) {
  const record = JSON.parse(readFileSync(join(directory, file), 'utf8')), layer = record.context_layer;
  if (!layer?.snapshots) continue;
  const previous = new Map();
  for (const request of layer.events.filter(e => e.kind === 'inference_request' && e.content === 'answer')) {
    const payload = request.metadata.payload;
    if (!payload?.input || !payload.input.some(i => typeof i.content === 'string' && i.content.startsWith('Working context revision'))) continue;
    const revision = request.metadata.context_revision, snapshot = layer.snapshots.find(s => s.revision === revision);
    if (!snapshot) continue;
    const store = new Store(undefined, { memory: true });
    try {
      for (const e of layer.events.filter(e => e.seq < request.seq)) store.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?)').run(e.seq, e.id, record.conversation_id, e.kind, e.actor, e.timestamp, e.content, JSON.stringify(e.metadata));
      for (const s of layer.snapshots.filter(s => s.revision <= revision)) store.db.prepare('INSERT INTO snapshots VALUES (?,?,?,?)').run(record.conversation_id, s.revision, JSON.stringify(s.segments), s.receipt_id);
      const provider = { name: request.metadata.provider, ...(request.metadata.provider === 'anthropic' ? { requestPayload: anthropicPayload } : {}) };
      const h = new Harness(store, record.conversation_id, provider, { model: payload.model, budget: request.metadata.input_budget, output: request.metadata.output_reserve });
      const compact = { ...payload, instructions: payload.instructions.replace(/\nRuntime context status:.*$/, ''), input: payload.input.map(i => typeof i.content === 'string' && i.content.startsWith('Working context revision') ? h.input()[0] : i) };
      const oldProvider = provider.name === 'anthropic' ? { name: provider.name, requestPayload: p => anthropicPayload({ ...p, prompt_cache: false }) } : provider;
      const oldCount = inputSize(payload, oldProvider).tokenizer_tokens, nextCount = inputSize(compact, provider).tokenizer_tokens;
      const serial = p => JSON.stringify({ instructions: p.instructions, tools: p.tools, input: p.input });
      const common = (a = '', b = '') => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return tokenize(b.slice(0, n)); };
      const key = provider.name + ':' + payload.model, prev = previous.get(key);
      // Same answer-call/output trajectory, full source headers and actual tool
      // continuation tail. No selector/compaction in this append counterfactual.
      const append = { ...compact, input: [...new Harness(store, record.conversation_id, provider, { model: payload.model, mode: 'append' }).input(), ...payload.input.filter(i => i.type || (typeof i.content === 'string' && i.content.startsWith('Current saved workspace manifest')))] };
      const appendTokens = inputSize(append, provider).tokenizer_tokens;
      const priorAppend = prev?.append, prefix = priorAppend ? common(priorAppend, serial(append)) : 0;
      const withinTTL = prev && Date.parse(request.timestamp) - Date.parse(prev.timestamp) < 300000;
      const eligible = withinTTL && prefix >= (provider.name === 'anthropic' ? 4096 : 1024) ? Math.min(prefix, appendTokens) : 0;
      const response = layer.events.find(e => e.kind === 'inference_response' && e.metadata.request_id === request.id);
      const output = response?.metadata.usage?.output_tokens;
      const usage = read => provider.name === 'anthropic'
        ? { input_tokens: appendTokens, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: appendTokens - read, cache_creation: { ephemeral_5m_input_tokens: appendTokens - read, ephemeral_1h_input_tokens: 0 } }
        : { input_tokens: appendTokens, output_tokens: output, input_tokens_details: { cached_tokens: read, cache_write_tokens: appendTokens - read } };
      rows.push({ conversation: record.conversation_id, seq: request.seq, provider: provider.name, model: payload.model,
        before_local_tokens: oldCount, compact_local_tokens: nextCount, reduction_fraction: 1 - nextCount / oldCount,
        previous_common_prefix_tokens: prev ? common(prev.old, serial(payload)) : 0,
        compact_common_prefix_tokens: prev ? common(prev.compact, serial(compact)) : 0,
        append_local_tokens: appendTokens, append_eligible_prefix_estimate: eligible,
        append_optimistic: priceUsage(usage(eligible), provider.name, payload.model, prices),
        append_cold: priceUsage(usage(0), provider.name, payload.model, prices) });
      previous.set(key, { old: serial(payload), compact: serial(compact), append: serial(append), timestamp: request.timestamp });
    } finally { store.close(); }
  }
}
const output = resolve('docs/reports/projection-analysis-2026-10-02.json');
writeFileSync(output, JSON.stringify({ generated_at: new Date().toISOString(), scope: 'Offline reconstruction of saved layered answer requests only; no inference calls', assumptions: [
  'Local o200k counts estimate native framing. Actual billed counts are unchanged.',
  'Append counterfactual preserves answer call count, output tokens, tools, source headers and submitted continuation tail. Management disappears in this scenario; actual management/title costs remain in the cost report.',
  'Optimistic cache scenario assumes matching prefix token boundaries eligible within 5 minutes; cold scenario assumes cache writes. This approximates provider cache matching and is not a measured saving.',
  'Stable instructions/tools are serialized first for common-prefix analysis. Short/long pricing uncertainty is retained.',
  'Projection edits and trajectories can change future answers, calls and quality. Compare the live paired trials separately.',
], rows }, null, 2));
console.log(`Analyzed ${rows.length} saved answer requests; ${output}`);
