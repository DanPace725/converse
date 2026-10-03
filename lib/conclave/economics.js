import { readFileSync } from 'node:fs';
import { priceUsage, normalizeUsage } from './costs.js';
import { tokenize } from './input-size.js';

const snapshot = JSON.parse(readFileSync(new URL('./resources/model-costs-2026-10-02.json', import.meta.url), 'utf8'));
export const ECONOMIC_POLICY = 'observed-whole-task-v1';
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const models = [...snapshot.models, ...(snapshot.management_models || [])];
export function observedCache(events, provider, model) {
  const ids = new Set(events.filter(e => e.kind === 'inference_request' && e.content === 'answer'
    && e.metadata.provider === provider && e.metadata.payload?.model === model).map(e => e.id));
  const rows = events.filter(e => e.kind === 'inference_response' && ids.has(e.metadata.request_id)).slice(-8)
    .map(e => normalizeUsage(e.metadata.usage, provider)).filter(c => c?.input > 0);
  const reads = rows.reduce((n, c) => n + (c.read || 0), 0), writes = rows.reduce((n, c) => n + (c.write || 0), 0);
  return { samples: rows.length, read_tokens: reads, write_tokens: writes,
    bucket_coverage: rows.length > 0 && rows.every(c => c.read != null && c.write != null),
    // Keep a stable prefix breakpoint when cache creation dominates reads.
    boundary: rows.length && writes > reads ? 'settled-prefix' : 'growing-tail' };
}

export function delegationCost(adapter, provider, model, avoidedTokens, cache = {}) {
  const row = models.find(r => r.provider === provider && r.model === model);
  const selector = models.find(r => r.provider === adapter?.provider?.name && r.model === adapter?.options?.model);
  if (!row?.rates || !selector?.rates || !Number.isFinite(avoidedTokens))
    return { allowed: false, reason: 'Unknown exact model rates', estimated_saving_usd: null, overhead_usd: null };
  const rate = cache.read_tokens > cache.write_tokens ? row.rates.cached_input ?? row.rates.input : row.rates.input;
  // Use the serialized-byte cap as an upper token bound, not a measured count.
  const overhead = ((adapter.options.budget || 8000) * selector.rates.input
    + (adapter.options.output || 0) * selector.rates.output) / 1e6;
  const saving = Math.max(0, avoidedTokens) * rate / 1e6;
  return { allowed: saving > overhead * 1.25, reason: 'Conservative local estimate; no measured savings claim',
    comparison: 'Delegated judgment versus an extra task-model judgment; deterministic selection has no inference cost',
    estimated_saving_usd: saving, overhead_usd: overhead, pricing_date: snapshot.checked_date };
}

export function managementEconomics(events, { provider, model, removableText = '', adapter = null }) {
  const requests = events.filter(e => e.kind === 'inference_request');
  const responses = new Map(events.filter(e => e.kind === 'inference_response').map(e => [e.metadata.request_id, e]));
  const priced = requests.map(request => ({ request, response: responses.get(request.id),
    cost: priceUsage(responses.get(request.id)?.metadata.usage, request.metadata.provider, request.metadata.payload?.model, snapshot) }));
  const recent = priced.filter(c => c.request.content === 'answer' && c.request.metadata.provider === provider
    && c.request.metadata.payload?.model === model && c.cost.counts?.input > 0).slice(-8);
  const known = recent.filter(c => c.cost.usd_min != null);
  const inputPrice = known.map(c => priceUsage({ ...c.response.metadata.usage, output_tokens: 0 }, provider, model, snapshot));
  const inputRateMin = mean(inputPrice.map((c, i) => c.usd_min / known[i].cost.counts.input));
  const inputRateMax = mean(inputPrice.map((c, i) => c.usd_max / known[i].cost.counts.input));
  const tokens = tokenize(removableText), horizon = Math.min(4, Math.max(1, known.length));
  const carry = inputRateMin == null ? null : tokens * horizon * inputRateMin;
  const purposeMean = purpose => {
    const rows = priced.filter(c => c.request.content === purpose && (purpose === 'compaction'
      ? c.request.metadata.provider === provider && c.request.metadata.payload?.model === model
      : c.request.metadata.provider === adapter?.provider?.name && c.request.metadata.payload?.model === adapter?.options?.model)).slice(-8);
    return rows.some(c => c.cost.usd_max == null) ? null : mean(rows.map(c => c.cost.usd_max));
  };
  const delegation = delegationCost(adapter, provider, model, tokens * horizon);
  const selection = purposeMean('attention-selection') ?? (adapter ? delegation.overhead_usd : 0);
  const rewrite = purposeMean('compaction') ?? null;
  // Source retrieval is a local tool. Its excerpts still cost input on the next
  // answer; estimate one historical average retrieval, in addition to carry.
  const retrievalTokens = mean(events.filter(e => e.kind === 'tool_result' && ['search_history', 'retrieve_event', 'retrieve_range', 'resolve_context'].includes(e.metadata.tool)).slice(-8).map(e => tokenize(e.content))) ?? 0;
  const cache = observedCache(events, provider, model);
  const row = models.find(r => r.provider === provider && r.model === model);
  const tiers = row?.rates ? [row.rates, ...(row.long_context_rates ? [row.long_context_rates] : [])] : [];
  const reranks = priced.filter(c => c.request.content === 'retrieval-reranking'
    && c.request.metadata.provider === adapter?.provider?.name && c.request.metadata.payload?.model === adapter?.options?.model).slice(-8);
  const rerankCost = reranks.some(c => c.cost.usd_max == null) ? null : mean(reranks.map(c => c.cost.usd_max)) ?? 0;
  const retrieval = inputRateMax == null || !tiers.length || rerankCost == null ? null
    : retrievalTokens * Math.max(...tiers.map(r => r.input)) / 1e6 + rerankCost;
  const cacheLoss = tiers.length && cache.bucket_coverage ? tokens * Math.max(0, ...tiers.map(r =>
    Math.max(r.cache_write ?? r.input, row.cache_write_1h ?? row.cache_write_1h_rate ?? 0) - (r.cached_input ?? r.input))) / 1e6 : null;
  const complete = carry != null && selection != null && rewrite != null && retrieval != null && cacheLoss != null;
  const overhead = complete ? selection + rewrite + retrieval + cacheLoss : null;
  return { policy_version: ECONOMIC_POLICY, pricing_date: snapshot.checked_date,
    basis: 'dated public-rate valuation and local token estimates; projected costs are not billed savings',
    samples: known.length, unpriced_calls: priced.filter(c => c.cost.usd_min == null).length,
    known_total_usd_min: priced.reduce((n, c) => n + (c.cost.usd_min ?? 0), 0),
    known_total_usd_max: priced.reduce((n, c) => n + (c.cost.usd_max ?? 0), 0),
    removable_local_tokens: tokens, horizon_calls: horizon, cache,
    components_usd: { carry, selection, rewrite, retrieval, cache_rebuild: cacheLoss },
    complete, due: complete && carry > overhead * 1.25,
    reason: complete ? 'Projected carry compared with selection, rewrite, retrieval and cache rebuild' : 'Insufficient observed cost coverage; pressure and periodic guards remain available' };
}
