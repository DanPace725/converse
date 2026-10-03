import { readFileSync } from 'node:fs';
import { normalizeUsage } from './costs.js';

const snapshot = JSON.parse(readFileSync(new URL('./resources/model-costs-2026-10-02.json', import.meta.url), 'utf8'));
export const ECONOMIC_POLICY = 'action-next-request-shadow-v2';
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

// Shadow pricing uses the already-pending next request only. Forecasting later
// requests requires calibration; observed sample count is not a forecast.
export function managementEconomics(events, {
  provider, model, requestTokens, candidates = [], cacheState = 'unknown',
  cacheWriteTtl = 'unknown', revision = null,
}) {
  const row = models.find(r => r.provider === provider && r.model === model);
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const validRates = r => r && [r.input, r.output].every(n => Number.isFinite(n) && n >= 0);
  const ratesFor = tokens => !row?.long_context_rates ? [row?.rates]
    : row.long_context_input_threshold != null
      ? [tokens > row.long_context_input_threshold ? row.long_context_rates : row.rates]
      : [row.rates, row.long_context_rates];
  const inputCost = (tokens, state, reusable = 0, billingTokens = tokens) => {
    if (!count(tokens) || !count(reusable) || reusable > tokens) return null;
    const tiers = ratesFor(billingTokens);
    if (!tiers.every(validRates)) return null;
    const values = tiers.flatMap(r => {
      const read = r.cached_input ?? r.input;
      const write = cacheWriteTtl === '1h' ? row.cache_write_1h ?? row.cache_write_1h_rate ?? r.cache_write ?? r.input
        : cacheWriteTtl === '5m' ? r.cache_write ?? r.input
          : Math.max(r.cache_write ?? r.input, row.cache_write_1h ?? row.cache_write_1h_rate ?? 0);
      if (![read, write].every(n => Number.isFinite(n) && n >= 0)) return [NaN];
      if (state === 'warm') return [tokens * read / 1e6];
      if (state === 'cold') return [tokens * write / 1e6];
      // Unknown prefix validity: preserve only a documented reusable prefix.
      return [tokens * Math.min(read, r.input, write) / 1e6,
        (reusable * read + (tokens - reusable) * Math.max(r.input, write)) / 1e6];
    });
    return values.every(Number.isFinite) ? { min: Math.min(...values), max: Math.max(...values) } : null;
  };
  const keep = inputCost(requestTokens, cacheState);
  const assessed = candidates.map(a => {
    const issues = [];
    const validRequest = count(a.request_tokens?.min) && count(a.request_tokens?.max)
      && a.request_tokens.min <= a.request_tokens.max;
    const validRecovery = count(a.recovery_tokens?.min) && count(a.recovery_tokens?.max)
      && a.recovery_tokens.min <= a.recovery_tokens.max;
    if (!validRequest) issues.push('Candidate request bounds unavailable');
    if (!validRecovery) issues.push('Recovery bounds unavailable');
    const management = a.method === 'summary' ? a.management : { input_tokens: 0, output_tokens: 0 };
    if (!count(management?.input_tokens) || !count(management?.output_tokens)) issues.push('Management request/output bound unavailable');
    const tiers = validRequest ? ratesFor(a.request_tokens.max) : [];
    if (!keep || !tiers.length || !tiers.every(validRates)) issues.push('Exact model rates or input count unavailable');
    if (a.feasible === false) issues.push(a.reason || 'Candidate is not feasible');
    if (issues.length) return { ...a, complete: false, cost_usd: null, saving_usd: null, reasons: issues };
    // Every edit may break all context cache entries. Only an explicitly supplied
    // reusable prefix lowers that bound; old whole-request hit ratios do not.
    const low = inputCost(a.request_tokens.min, 'unknown', 0);
    const high = inputCost(a.request_tokens.max, 'unknown', cacheState === 'cold' ? 0 : a.reusable_prefix_tokens || 0,
      a.request_tokens.max + a.recovery_tokens.max);
    if (!low || !high) return { ...a, complete: false, cost_usd: null, saving_usd: null, reasons: ['Invalid reusable prefix bound'] };
    const manageTiers = ratesFor(management.input_tokens);
    const allTiers = [...tiers, ...manageTiers, ...ratesFor(a.request_tokens.max + a.recovery_tokens.max)];
    if (!allTiers.every(validRates)) return { ...a, complete: false, cost_usd: null, saving_usd: null, reasons: ['Management price tier unavailable'] };
    const managementCost = Math.max(...manageTiers.map(r => (management.input_tokens * Math.max(r.input, r.cache_write ?? r.input,
      cacheWriteTtl === '5m' ? 0 : row.cache_write_1h ?? row.cache_write_1h_rate ?? 0) + management.output_tokens * r.output) / 1e6));
    // Recovered excerpts can be written into the next cache, not just read at
    // base input prices. Use the largest applicable input/write price.
    const recoveryRate = Math.max(...allTiers.map(r => Math.max(r.input, r.cache_write ?? r.input,
      cacheWriteTtl === '5m' ? 0 : row.cache_write_1h ?? row.cache_write_1h_rate ?? 0)));
    const recovery = { min: a.recovery_tokens.min * Math.min(...allTiers.map(r => r.cached_input ?? r.input)) / 1e6,
      max: a.recovery_tokens.max * recoveryRate / 1e6 };
    const cost = { min: low.min + recovery.min, max: high.max + recovery.max + managementCost };
    return { ...a, complete: true, cost_usd: cost,
      components_usd: { next_input: { min: low.min, max: high.max }, management_upper: managementCost, recovery },
      saving_usd: { min: keep.min - cost.max, max: keep.max - cost.min }, reasons: [] };
  });
  const winner = assessed.filter(a => a.complete && a.saving_usd.min > 0)
    .sort((a, b) => a.cost_usd.max - b.cost_usd.max)[0];
  return { policy_version: ECONOMIC_POLICY, pricing_date: snapshot.checked_date, provider, model, revision,
    execution: 'shadow', due: false, horizon_calls: 1, future_requests: 'unavailable; not inferred from pricing samples',
    basis: 'Public-rate valuation of local o200k-base serialized input; context and management costs only, not billed savings',
    exclusions: ['Answer-output differences', 'Extra answer calls caused by retrieval', 'Quality and latency', 'Retries', 'Unmeasured source reuse'],
    cache: { state: cacheState, write_ttl: cacheWriteTtl, observed: observedCache(events, provider, model) },
    keep_cost_usd: keep, candidates: assessed, complete: !!keep,
    shadow_choice: winner?.id || 'keep', shadow_method: winner?.method || 'keep',
    reason: !keep ? 'Exact model rates or input count unavailable; no economic trigger'
      : winner ? 'Candidate beats keep across supplied bounds; shadow only'
        : 'No candidate beats keep across supplied bounds; wait',
  };
}
