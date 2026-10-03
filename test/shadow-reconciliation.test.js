import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { Harness } from '../lib/conclave/harness.js';
import { traceCache } from '../lib/conclave/cache-trace.js';
import { anthropicPayload } from '../lib/conclave/provider.js';

const final = { status: 'completed', usage: { input_tokens: 1000, output_tokens: 5,
  input_tokens_details: { cached_tokens: 900, cache_write_tokens: 0 } },
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ready.' }] }] };
const provider = { name: 'openai', respond: async () => final };
function fixture(options = {}) {
  const store = new Store(undefined, { memory: true }), id = store.create();
  const h = new Harness(store, id, provider, { model: 'gpt-6-luna', budget: 256000, recent: 1,
    shadowEvaluationMs: 2000, ...options });
  h.addMessage('assistant', 'Background '.repeat(1500)); h.addMessage('user', 'Current request.');
  return { store, id, h };
}

test('unchanged local evaluation reuses its forecast without rebuilding candidates', () => {
  const { store, id, h } = fixture();
  try {
    const first = h.evaluateShadow(); assert.equal(first.cache_hit, false);
    h.contextCostCandidates = () => { throw Error('Should reuse'); };
    const second = h.evaluateShadow(); assert.equal(second.cache_hit, true);
    assert.deepEqual(second.candidates, first.candidates);
    assert.equal(store.events(id).filter(e => e.kind === 'inference_request').length, 0);
    h.options.output++; assert.equal(h.evaluateShadow().evaluation_status, 'unavailable', 'Output allowance invalidates cache');
  } finally { store.close(); }
});

for (const failure of ['throw', 'deadline', 'bytes']) test(`shadow ${failure} cannot prevent the answer`, async () => {
  const { store, id, h } = fixture();
  try {
    if (failure === 'throw') h.contextCostCandidates = () => { throw Error('Fixture estimator failure'); };
    if (failure === 'deadline') { let time = 0; h.options.shadowClock = () => time += 50; h.options.shadowEvaluationMs = 20; }
    if (failure === 'bytes') h.options.shadowEvaluationBytes = 10;
    const answer = await h.ask('Give the answer.'); assert.equal(answer.text, 'Ready.');
    assert.equal(store.events(id).filter(e => e.kind === 'inference_request').length, 1);
    assert.equal(store.events(id).findLast(e => e.kind === 'context_economics').metadata.evaluation_status, 'unavailable');
  } finally { store.close(); }
});

test('answer request links its estimate and reports input-only cost without monetizing output', async () => {
  const { store, id, h } = fixture();
  try {
    await h.ask('Give the answer.');
    const request = store.events(id).findLast(e => e.kind === 'inference_request');
    const row = store.events(id).findLast(e => e.kind === 'context_cost_reconciliation').metadata;
    assert.ok(request.metadata.economics_event_id); assert.equal(row.request_id, request.id);
    assert.equal(row.comparable, true); assert.equal(row.usage.read, 900);
    assert.ok(row.actual_input_usd.max < 0.00005);
    assert.ok(row.predicted_input_usd); assert.ok(row.difference_usd);
    const inspection = await h.executeTool('read_telemetry', {}, []);
    assert.deepEqual(inspection.latest_cost_reconciliation, row);
  } finally { store.close(); }
});

test('changed payload does not claim an observed counterfactual saving', async () => {
  const { store, id, h } = fixture();
  try {
    h.evaluateShadow(); await h.call({ ...h.answerPayload(), instructions: 'Different input' }, 'answer');
    const row = store.events(id).findLast(e => e.kind === 'context_cost_reconciliation').metadata;
    assert.equal(row.comparable, false); assert.equal(row.predicted_input_usd, null); assert.equal(row.difference_usd, null);
  } finally { store.close(); }
});

test('partial provider usage reconciles even when the answer fails', async () => {
  const { store, id, h } = fixture();
  try {
    h.provider = { name: 'openai', respond: async () => { const error = Error('Interrupted provider');
      error.partial_response = { ...final, status: 'partial' }; throw error; } };
    await assert.rejects(h.ask('Answer.'), /Interrupted/);
    assert.equal(store.events(id).findLast(e => e.kind === 'context_cost_reconciliation').metadata.status, 'partial');
  } finally { store.close(); }
});

test('reconciliation logging failure does not turn a completed answer into a failed one', async () => {
  const { store, h } = fixture();
  try {
    const append = store.append.bind(store); store.append = (...args) => {
      if (args[1] === 'context_cost_reconciliation' || args[1] === 'context_economics') throw Error('Optional logging failed');
      return append(...args);
    };
    assert.equal((await h.ask('Answer.')).text, 'Ready.');
  } finally { store.close(); }
});

test('native-prefix matching reports content and default-TTL age without promising residency', () => {
  const nativeProvider = { name: 'anthropic', requestPayload: anthropicPayload };
  const payload = { model: 'claude-sonnet-5-5', instructions: 'Stable instructions.', max_output_tokens: 1000,
    input: [{ role: 'user', content: 'Stable background.', cache_boundary: 'settled' }, { role: 'user', content: 'Old tail.' }] };
  const request = { id: 'previous', kind: 'inference_request', content: 'answer', timestamp: '2026-10-03T00:00:00Z',
    metadata: { provider: 'anthropic', payload } };
  const next = { ...payload, input: [...payload.input.slice(0, 1), { role: 'user', content: 'New tail.' }] };
  const trace = traceCache([request], next, nativeProvider, { now: Date.parse('2026-10-03T00:01:00Z') });
  assert.ok(trace.eligible_prefix_units > 0); assert.ok(trace.prefix_local_tokens > 0);
  assert.equal(trace.ttl_phase, 'within-default-ttl'); assert.match(trace.residency, /^unknown/);
  const expired = traceCache([request], next, nativeProvider, { now: Date.parse('2026-10-03T00:06:00Z') });
  assert.equal(expired.ttl_phase, 'past-default-ttl'); assert.equal(expired.prefix_hash, trace.prefix_hash);
  const changed = traceCache([request], { ...next, instructions: 'Changed instructions.' }, nativeProvider);
  assert.ok(changed.eligible_prefix_units < trace.eligible_prefix_units);
});

test('abort remains authoritative rather than becoming a shadow fallback', () => {
  const controller = new AbortController(), { store, h } = fixture({ signal: controller.signal });
  try { controller.abort(Error('Stop now')); assert.throws(() => h.evaluateShadow(), /Stop now/); }
  finally { store.close(); }
});
