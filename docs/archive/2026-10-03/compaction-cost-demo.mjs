// Offline sensitivity calculation. No provider calls, engine imports or mutations.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const snapshot = JSON.parse(readFileSync(new URL('../../model-costs-2026-10-02.json', import.meta.url)));
const rate = (provider, model) => {
  const row = snapshot.models.find(r => r.provider === provider && r.model === model);
  assert.ok(row?.rates, 'Exact model must have rates');
  return row.rates;
};
const sonnet = rate('anthropic', 'claude-sonnet-5-5');
const luna = rate('openai', 'gpt-6-luna');
const usd = (tokens, price) => tokens * price / 1e6;

// All counts and reuse assumptions below are synthetic. Standard rates only.
// first: unchanged prefix reads + rewritten suffix writes. Later: full reads.
// A cold baseline also writes; this avoids charging rebuild twice.
function compare({ retained = 20000, stable = 0, old = 20000, warm = true,
  weights = [1, 1, 1, 1], retrievalProbability = 0.05, compressor = sonnet }) {
  assert.ok(weights[0] === 1 && weights.every((w, i) => w >= 0 && w <= 1 && (!i || w <= weights[i - 1])));
  assert.ok(stable >= 0 && stable <= retained);
  const rewrite = usd(old, compressor.input) + usd(2000, compressor.output);
  const methods = [
    { method: 'keep', replacement: old, overhead: 0, recover: 0 },
    { method: 'pointer', replacement: 200, overhead: 0,
      recover: retrievalProbability * usd(old, sonnet.input) },
    { method: 'summary', replacement: 2000, overhead: rewrite,
      recover: retrievalProbability * usd(old, sonnet.input) },
  ];
  const rows = methods.map(a => {
    const total = retained + a.replacement;
    const first = a.method === 'keep'
      ? usd(total, warm ? sonnet.cached_input : sonnet.cache_write)
      : usd(stable, warm ? sonnet.cached_input : sonnet.cache_write)
        + usd(total - stable, sonnet.cache_write);
    const later = usd(total, sonnet.cached_input);
    return { method: a.method, cost_usd: a.overhead + first + a.recover
      + weights.slice(1).reduce((n, w) => n + w * (later + a.recover), 0),
      management_usd: a.overhead, first_input_usd: first,
      subsequent_input_usd: later, recovery_per_request_usd: a.recover };
  });
  rows.forEach(a => { a.saving_vs_keep_usd = rows[0].cost_usd - a.cost_usd; });
  return { choice: [...rows].sort((a, b) => a.cost_usd - b.cost_usd)[0].method, rows };
}
const cases = [
  { name: 'warm prefix; four certain requests', options: {}, expected: 'keep' },
  { name: 'expired prefix; four certain requests', options: { warm: false }, expected: 'pointer' },
  { name: 'warm prefix; edit after stable 20k-token boundary', options: { stable: 20000 }, expected: 'pointer' },
  { name: 'warm prefix; shrinking chance of continuation', options: { weights: [1, 0.6, 0.3, 0.1] }, expected: 'keep' },
  { name: 'warm prefix; cheap summary still rebuilds cache', options: { compressor: luna }, expected: 'keep' },
  { name: 'expired prefix; source needed on every request', options: { warm: false, retrievalProbability: 1 }, expected: 'keep' },
];
const results = cases.map(c => {
  const result = compare(c.options);
  assert.equal(result.choice, c.expected, c.name);
  return { scenario: c.name, ...result };
});
const output = { basis: 'Synthetic standard-rate sensitivity; not live savings or validated fidelity',
  pricing_date: snapshot.checked_date, answer_model: 'claude-sonnet-5-5',
  assumptions: { old_tokens: 20000, retained_tokens: 20000, pointer_tokens: 200,
    summary_tokens: 2000, retrieval: 'Fresh full source at base input rate; no extra answer call/output modeled',
    unchanged_prefix: 'Only reusable when a previous eligible cache entry exists at this boundary',
    exclusions: 'No price tier changes, latency, stochastic summary length, selector calls, or answer-quality differences' },
  checks: `${results.length} scenario assertions passed`, results };
console.log(JSON.stringify(output, null, 2));
