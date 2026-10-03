import test from 'node:test';
import assert from 'node:assert/strict';
import { managementEconomics } from '../lib/conclave/economics.js';
import { Harness, budgetUnits } from '../lib/conclave/harness.js';
import { Store } from '../lib/conclave/store.js';
import { anthropicPayload } from '../lib/conclave/provider.js';

const pointer = { id: 'pointer:a', method: 'pointer', bundle_ids: ['a'],
  request_tokens: { min: 20200, max: 20200 }, recovery_tokens: { min: 0, max: 0 } };
const summary = { id: 'summary:a', method: 'summary', bundle_ids: ['a'],
  request_tokens: { min: 22000, max: 22000 }, recovery_tokens: { min: 0, max: 0 },
  management: { input_tokens: 20000, output_tokens: 2000 } };
const price = options => managementEconomics([], { provider: 'anthropic', model: 'claude-sonnet-5-5',
  requestTokens: 40000, cacheWriteTtl: '5m', candidates: [pointer, summary], ...options });

test('first-use pricing includes the actual proposed management input/output without past inference', () => {
  const e = price({ cacheState: 'cold' });
  assert.equal(e.complete, true); assert.equal(e.horizon_calls, 1);
  assert.equal(e.candidates[1].components_usd.management_upper, 0.07);
  assert.equal(e.shadow_method, 'pointer'); assert.equal(e.due, false);
  assert.equal(e.execution, 'shadow'); assert.equal(e.cache.observed.samples, 0);
});

test('warm invalidated prefix waits while expired keep also pays its own rebuild', () => {
  const warm = price({ cacheState: 'warm' }), cold = price({ cacheState: 'cold' });
  assert.equal(warm.keep_cost_usd.min, 0.008); assert.equal(warm.shadow_choice, 'keep');
  assert.equal(cold.keep_cost_usd.max, 0.1); assert.equal(cold.shadow_method, 'pointer');
  assert.equal(cold.candidates[0].cost_usd.max, 0.0505);
  assert.ok(cold.candidates[0].saving_usd.min > 0);
});

test('unknown cache validity waits and expensive source reuse can erase a cold saving', () => {
  assert.equal(price({}).shadow_choice, 'keep');
  const e = price({ cacheState: 'cold', candidates: [{ ...pointer, recovery_tokens: { min: 40000, max: 40000 } }] });
  assert.equal(e.shadow_choice, 'keep'); assert.ok(e.candidates[0].saving_usd.min < 0);
});

test('a documented warm boundary can preserve a cheap prefix, while expiry removes that reuse', () => {
  const candidate = { ...pointer, reusable_prefix_tokens: 20000 };
  const warm = price({ cacheState: 'warm', candidates: [candidate] });
  assert.equal(warm.shadow_method, 'pointer');
  assert.ok(Math.abs(warm.candidates[0].cost_usd.max - 0.0045) < 1e-12);
  const cold = price({ cacheState: 'cold', candidates: [candidate] });
  assert.equal(cold.candidates[0].cost_usd.max, 0.0505);
});

test('recovery crossing a known tier boundary reprices retained input too', () => {
  const e = price({ provider: 'gemini', model: 'gemini-3.1-pro-preview', cacheState: 'cold', requestTokens: 250000,
    candidates: [{ ...pointer, request_tokens: { min: 200000, max: 200000 }, recovery_tokens: { min: 0, max: 10000 } }] });
  assert.ok(Math.abs(e.candidates[0].cost_usd.max - 0.84) < 1e-12);
});

test('unknown exact rates, missing recovery and invalid bounds remain unavailable', () => {
  const unknown = price({ model: 'unpriced' });
  assert.equal(unknown.complete, false); assert.equal(unknown.keep_cost_usd, null); assert.equal(unknown.due, false);
  for (const candidate of [{ ...pointer, recovery_tokens: undefined },
    { ...pointer, request_tokens: { min: 300, max: 200 } }, { ...pointer, reusable_prefix_tokens: 50000 }]) {
    const e = price({ candidates: [candidate] });
    assert.equal(e.candidates[0].complete, false); assert.equal(e.shadow_choice, 'keep');
  }
});

test('unverified OpenAI tier boundary retains a price interval', () => {
  const e = price({ provider: 'openai', model: 'gpt-6-luna', cacheState: 'cold' });
  assert.ok(e.keep_cost_usd.max > e.keep_cost_usd.min);
  assert.equal(e.horizon_calls, 1);
});

test('observed samples do not silently extend the future request horizon', () => {
  const events = Array.from({ length: 8 }, (_, i) => [
    { id: 'r' + i, kind: 'inference_request', content: 'answer', metadata: { provider: 'anthropic', payload: { model: 'claude-sonnet-5-5' } } },
    { kind: 'inference_response', metadata: { request_id: 'r' + i, usage: { input_tokens: 40000,
      output_tokens: 1, cache_read_input_tokens: 39000, cache_creation_input_tokens: 1000 } } },
  ]).flat();
  const e = managementEconomics(events, { provider: 'anthropic', model: 'claude-sonnet-5-5', requestTokens: 40000 });
  assert.equal(e.cache.observed.samples, 8); assert.equal(e.horizon_calls, 1);
  assert.equal(e.cache.state, 'unknown'); assert.equal(e.due, false);
});

test('native provider previews preserve protections, full payload costs and source history without mutation', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), provider = { name: 'anthropic', requestPayload: anthropicPayload };
    const h = new Harness(store, id, provider, { model: 'claude-sonnet-5-5', recent: 1, budget: 256000 });
    h.pin('Exactly 12 seats.');
    const old = h.addMessage('assistant', 'Background detail '.repeat(1800));
    h.addMessage('user', 'Preserve the latest request.');
    const events = store.events(id), context = store.context(id);
    const preview = h.contextCostCandidates();
    assert.ok(preview.requestTokens > 2000, 'Includes tools/instructions/metadata');
    assert.ok(preview.candidates.some(a => a.method === 'summary' && a.management.input_tokens > 0));
    for (const candidate of preview.candidates) assert.deepEqual(candidate.bundle_ids, [old.item.id]);
    assert.deepEqual(store.events(id), events); assert.deepEqual(store.context(id), context);
    assert.match(store.source(id, old.event.id).content, /Background detail/);
    assert.deepEqual(preview, h.contextCostCandidates(), 'Repeated plans are deterministic');
  } finally { store.close(); }
});

test('local periodic check records shadow estimates with no inference or context change', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(); let calls = 0;
    const h = new Harness(store, id, { name: 'openai', respond: async () => { calls++; throw Error('No paid check expected'); } },
      { model: 'gpt-6-luna', budget: 500000, recent: 1, reviewTokens: 1,
        decisionAdapter: { select: async () => { calls++; throw Error('No selector expected'); } } });
    h.addMessage('assistant', 'Background detail '.repeat(4500)); h.addMessage('user', 'Current request.');
    const before = store.context(id);
    const result = await h.reviewContext();
    assert.equal(result.status, 'not_needed'); assert.equal(calls, 0); assert.deepEqual(store.context(id), before);
    const e = store.events(id).findLast(e => e.kind === 'context_economics').metadata;
    assert.equal(e.execution, 'shadow'); assert.ok(e.candidates.length);
    assert.equal(store.events(id).findLast(e => e.kind === 'context_review').metadata.execution, 'local');
  } finally { store.close(); }
});

test('pressure offloads routine material before a selector; pin/request stay exact and original is retrievable', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(); let selectors = 0;
    const h = new Harness(store, id, { name: 'openai' }, { model: 'gpt-6-luna', budget: 256000, recent: 1,
      decisionAdapter: { select: async () => { selectors++; throw Error('Should offload first'); } } });
    h.pin('Exact budget cap: 250.');
    const old = h.addMessage('assistant', 'Routine background '.repeat(2400));
    h.addMessage('user', 'Keep this current task.');
    h.options.budget = Math.ceil((budgetUnits(h.answerPayload()) + h.options.output) / 0.8);
    const result = await h.reviewContext();
    assert.equal(result.status, 'offloaded'); assert.equal(selectors, 0);
    assert.equal(store.events(id).filter(e => e.kind === 'inference_request').length, 0);
    assert.match(h.toolResult('resolve_context', { bundle_id: old.item.id }, []).content, /Routine background/);
    assert.ok(store.context(id).segments.some(s => s.content === 'Exact budget cap: 250.'));
    assert.ok(store.context(id).segments.some(s => s.content === 'Keep this current task.'));
  } finally { store.close(); }
});
