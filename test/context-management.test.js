import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { Harness, budgetUnits } from '../lib/conclave/harness.js';
import { WorkspaceHarness } from '../lib/conclave/workspace.js';
import { JevDecisionAdapter } from '../lib/conclave/jev.js';
import { anthropicPayload } from '../lib/conclave/provider.js';
import { projectReceipts, toolIngress, documentIngress } from '../lib/conclave/ingress.js';
import { managementEconomics, observedCache, delegationCost } from '../lib/conclave/economics.js';
import { inputSize } from '../lib/conclave/input-size.js';

const toolCall = (name, n, args = {}) => ({ type: 'function_call', call_id: 'call_' + n, name, arguments: JSON.stringify(args) });
function receipt(store, id, name, n, result) {
  const event = store.append(id, 'tool_result', JSON.stringify(result), { tool: name, call_id: 'call_' + n });
  return { event, item: { type: 'function_call_output', call_id: 'call_' + n, output: event.content } };
}
function observed(store, id, purpose, provider, model, usage) {
  const request = store.append(id, 'inference_request', purpose, { provider, payload: { model } });
  store.append(id, 'inference_response', purpose, { request_id: request.id, usage });
}
const usage = { input_tokens: 20000, output_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
const answer = (choice, keys, confidence = 0.95) => ({ type: 'choice', choice, confidence,
  probabilities: Object.fromEntries(keys.map(k => [k, k === choice ? 1 : 0])) });
function typedProvider(decide) {
  return { name: 'typesafe', respond: async payload => ({ status: 'completed', model: 'jev-latest',
    usage: { input_tokens: 20, output_tokens: 0 },
    answers: Object.fromEntries(Object.entries(payload.questions).map(([key, question], i) => {
      const decision = decide(question, i);
      return [key, answer(decision.choice, Object.keys(question.criteria), decision.confidence)];
    })) }) };
}

test('completed write arguments and superseded pages become source-linked views without touching the audit', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = new WorkspaceHarness(store, id, { name: 'openai' }, { budget: 256000 });
    h.pin('Exact constraint: keep 12 seats.'); h.addMessage('user', 'Maintain the file.');
    const text = '# Plan\n' + 'old detail '.repeat(650);
    const first = h.toolResult('workspace_write', { path: 'plan.md', content: text, expected_source_event_id: null }, []);
    const read = h.toolResult('workspace_read', { path: 'plan.md', offset: 0 }, []);
    const old = receipt(store, id, 'workspace_read', 1, read);
    const changed = h.toolResult('workspace_patch', { path: 'plan.md', find: '# Plan', replace: '# Revised plan', expected_source_event_id: first.source_event_id }, []);
    const write = receipt(store, id, 'workspace_patch', 2, changed);
    const current = h.toolResult('workspace_read', { path: 'plan.md', offset: 0 }, []);
    const one = receipt(store, id, 'workspace_read', 3, current), two = receipt(store, id, 'workspace_read', 4, current);
    const full = h.answerPayload([toolCall('workspace_read', 1), old.item, toolCall('workspace_patch', 2,
      { path: 'plan.md', find: text, replace: current.content }), write.item,
      toolCall('workspace_read', 3), one.item, toolCall('workspace_read', 4), two.item]);
    const projected = projectReceipts(full, store.events(id));
    assert.ok(budgetUnits(projected.payload) < budgetUnits(full) * 0.6);
    assert.ok(inputSize(projected.payload, h.provider).estimated_tokens < inputSize(full, h.provider).estimated_tokens);
    const oldView = JSON.parse(projected.payload.input.find(i => i.call_id === 'call_1' && i.output).output);
    assert.equal(oldView.superseded, true); assert.equal(oldView.current_source_event_id, changed.source_event_id);
    assert.equal(oldView.receipt_event_id, old.event.id);
    assert.equal(projected.payload.input.find(i => i.call_id === 'call_4' && i.output).output, two.item.output);
    assert.equal(store.event(id, old.event.id).content, old.item.output);
    assert.equal(store.source(id, first.source_event_id).content, text);
    assert.equal(h.toolResult('retrieve_event', { event_id: old.event.id, offset: 0 }, []).content, old.item.output.slice(0, 1600));
    assert.match(JSON.stringify(projected.payload), /Exact constraint: keep 12 seats/);
    assert.match(JSON.stringify(projected.payload), /Current saved workspace manifest/);
    assert.equal(h.completionCheck(), null);
    assert.equal(h.modelSegments(store.context(id).segments).find(s => s.workspace_version)?.workspace_version.source_event_id, changed.source_event_id);
  } finally { store.close(); }
});

test('Claude rolls over redundant signed write arguments instead of rewriting the signed prefix', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = new WorkspaceHarness(store, id, { name: 'anthropic' }, { budget: 256000, freezeProjection: true });
    h.addMessage('user', 'Create and verify the file.'); h.prepareAnswer([]);
    const text = '# File\n' + 'large content '.repeat(1400);
    const result = h.toolResult('workspace_write', { path: 'file.md', content: text, expected_source_event_id: null }, []);
    const saved = receipt(store, id, 'workspace_write', 1, result);
    const call = toolCall('workspace_write', 1, { path: 'file.md', content: text, expected_source_event_id: null });
    call.anthropic_content = { type: 'tool_use', id: call.call_id, name: call.name, input: JSON.parse(call.arguments) };
    const pending = [{ type: 'reasoning', anthropic_content: { type: 'thinking', thinking: 'Create file', signature: 'keep-original-signature' } }, call, saved.item];
    const next = h.prepareAnswer(pending);
    assert.match(JSON.stringify(next), /completed_tool_results/); assert.ok(JSON.stringify(next).includes(saved.event.id));
    assert.doesNotMatch(JSON.stringify(next), /keep-original-signature/);
    assert.equal(pending[1].anthropic_content.input.content, text);
    assert.equal(store.source(id, result.source_event_id).content, text);
    assert.equal(store.events(id).filter(e => e.kind === 'continuation_restart').length, 1);
    assert.match(h.completionCheck(), /file.md/);
  } finally { store.close(); }
});

test('tool ingress bounds bulk receipts but preserves exact current workspace pages and paging offsets', () => {
  const result = { revision: 7, segments: Array.from({ length: 60 }, () => ({ content: 'bulk '.repeat(600), offset: 0 })) };
  const projected = toolIngress('inspect_context', result, 'event_receipt');
  assert.ok(Buffer.byteLength(projected.output) < 12000); assert.equal(result.segments[0].content.length, 3000);
  assert.equal(JSON.parse(projected.output).receipt_event_id, 'event_receipt');
  const page = { path: 'file.md', source_event_id: 'source', content: 'x'.repeat(8000), offset: 8000, next_offset: 16000 };
  assert.deepEqual(JSON.parse(toolIngress('workspace_read', page, 'receipt').output), page);
  const excerpt = JSON.parse(toolIngress('resolve_context', { content: 'y'.repeat(3000), offset: 100 }, 'receipt').output);
  assert.equal(excerpt.result.next_offset, 1700); assert.equal(excerpt.result.content.length, 1600);
});

test('settled state precedes recent text; cache writes select a stable breakpoint and reads select the growing tail', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = new Harness(store, id, { name: 'anthropic' }, { model: 'claude-sonnet-5-5', budget: 256000 });
    h.addMessage('user', 'Earlier request.'); h.remember('limit', 'constraint', 'Confirmed user limit: 12 seats.');
    h.addMessage('user', 'Recent tail A');
    observed(store, id, 'answer', 'anthropic', h.options.model,
      { input_tokens: 10000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 9000 });
    const first = h.answerPayload(); h.addMessage('assistant', 'Recent tail B'); const second = h.answerPayload();
    assert.match(first.input[0].content, /12 seats/); assert.doesNotMatch(first.input[0].content, /Recent tail A/);
    assert.equal(first.input[0].content, second.input[0].content); assert.equal(second.input[0].cache_boundary, 'settled');
    const native = anthropicPayload(second);
    assert.equal(native.messages[0].content[0].cache_control.type, 'ephemeral');
    assert.equal(native.system[0].cache_control.type, 'ephemeral');
    assert.equal(anthropicPayload({ ...second, prompt_cache: false }).messages[0].content[0].cache_control, undefined);
    observed(store, id, 'answer', 'anthropic', h.options.model,
      { input_tokens: 20000, output_tokens: 1, cache_read_input_tokens: 19000, cache_creation_input_tokens: 0 });
    assert.equal(observedCache(store.events(id), 'anthropic', h.options.model).boundary, 'growing-tail');
    assert.equal(h.answerPayload().input[0].cache_boundary, undefined);
  } finally { store.close(); }
});

test('economic trigger accounts for carry, selection, rewrite, retrieval and cache rebuild; missing rates stay unknown', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = new Harness(store, id, { name: 'openai' }, { model: 'gpt-6-luna', budget: 500000, recent: 1 });
    h.addMessage('assistant', 'Background detail '.repeat(4500)); h.addMessage('user', 'Keep the current request.');
    for (let i = 0; i < 4; i++) observed(store, id, 'answer', 'openai', 'gpt-6-luna', usage);
    observed(store, id, 'compaction', 'openai', 'gpt-6-luna', { ...usage, input_tokens: 5, output_tokens: 1 });
    const economics = managementEconomics(store.events(id), { provider: 'openai', model: 'gpt-6-luna', removableText: store.context(id).segments[0].content });
    assert.equal(economics.complete, true); assert.equal(economics.due, true);
    assert.deepEqual(Object.keys(economics.components_usd), ['carry', 'selection', 'rewrite', 'retrieval', 'cache_rebuild']);
    assert.equal(h.attentionPlan().selected_bundle_ids.length, 0, 'below pressure threshold');
    const result = await h.reviewContext(); assert.equal(result.status, 'offloaded');
    assert.ok(store.context(id).segments.some(s => s.content === 'Keep the current request.'));
    assert.equal(store.events(id).filter(e => e.kind === 'inference_request').length, 5, 'lossless operation needs no new paid call');
    const unknown = managementEconomics(store.events(id), { provider: 'openai', model: 'unknown', removableText: 'data' });
    assert.equal(unknown.complete, false); assert.equal(unknown.due, false); assert.equal(unknown.components_usd.carry, null);
  } finally { store.close(); }
});

test('expensive management or heavily cached carry prevents an economic-only trigger', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create();
    for (let i = 0; i < 4; i++) observed(store, id, 'answer', 'openai', 'gpt-6-luna', { ...usage, input_tokens_details: { cached_tokens: 19900, cache_write_tokens: 0 } });
    observed(store, id, 'compaction', 'openai', 'gpt-6-luna', { ...usage, output_tokens: 16000 });
    const economics = managementEconomics(store.events(id), { provider: 'openai', model: 'gpt-6-luna', removableText: 'detail '.repeat(2000) });
    assert.equal(economics.complete, true); assert.equal(economics.due, false);
    assert.ok(economics.components_usd.rewrite > economics.components_usd.carry);
  } finally { store.close(); }
});

test('bounded Jev reranking recovers fixture evidence omitted by lexical top four, with deterministic fallback', async () => {
  const store = new Store(undefined, { memory: true });
  let confidence = 0.95, fail = false;
  const provider = typedProvider(q => ({ choice: q.instructions.candidate.excerpt.includes('orchard-719') ? 'direct' : 'background', confidence }));
  const respond = provider.respond; provider.respond = p => { if (fail) throw Error('Fixture outage'); return respond(p); };
  try {
    const id = store.create(), adapter = new JevDecisionAdapter(provider);
    const h = new Harness(store, id, { name: 'openai' }, { model: 'gpt-6-luna', budget: 256000, decisionAdapter: adapter });
    const target = h.ingestText('original.md', 'Recovery code: orchard-719; use after restart.');
    for (let i = 0; i < 5; i++) h.ingestText('discussion-' + i + '.md', 'Recovery code discussion: no confirmed value in this draft.');
    const baseline = h.toolResult('search_history', { query: 'recovery code' }, []);
    assert.ok(!baseline.some(e => e.event_id === target.id));
    const selected = await h.executeTool('search_history', { query: 'recovery code' }, []);
    assert.equal(selected[0].event_id, target.id); assert.match(selected[0].content, /orchard-719/);
    const request = store.events(id).find(e => e.kind === 'inference_request');
    assert.equal(request.content, 'retrieval-reranking'); assert.ok(budgetUnits(request.metadata.payload) <= adapter.options.budget);
    const restarted = new Harness(store, id, { name: 'openai' }, { model: 'gpt-6-luna', budget: 256000, decisionAdapter: adapter });
    assert.deepEqual(await restarted.executeTool('search_history', { query: 'recovery code' }, []), selected);
    assert.equal(store.events(id).filter(e => e.kind === 'inference_request').length, 1);
    assert.equal(store.events(id).findLast(e => e.kind === 'retrieval_decision').metadata.cache_hit, true);
    h.options.delegationCache = false;
    confidence = 0.4;
    assert.deepEqual(await h.executeTool('search_history', { query: 'recovery code' }, []), baseline);
    fail = true;
    assert.deepEqual(await h.executeTool('search_history', { query: 'recovery code' }, []), baseline);
    assert.ok(store.events(id).some(e => e.kind === 'decision_rejection' && e.metadata.purpose === 'retrieval-reranking'));
  } finally { store.close(); }
});

test('delegated retrieval keeps tool-call receipts linked to the task request across a mixed batch', async () => {
  const store = new Store(undefined, { memory: true });
  let turns = 0;
  try {
    const id = store.create(), adapter = new JevDecisionAdapter(typedProvider(q => ({ choice: q.instructions.candidate.excerpt.includes('orchard-719') ? 'direct' : 'background' })));
    const provider = { name: 'openai', respond: async () => ({ status: 'completed', usage,
      output: ++turns === 1 ? [toolCall('search_history', 1, { query: 'recovery code' }), toolCall('calculate_expression', 2, { expression: '6*2' })]
        : [{ type: 'message', content: [{ type: 'output_text', text: 'Recovered the code; 12 seats.' }] }] }) };
    const h = new WorkspaceHarness(store, id, provider, { model: 'gpt-6-luna', budget: 256000, decisionAdapter: adapter });
    h.ingestText('original.md', 'Recovery code: orchard-719.');
    for (let i = 0; i < 5; i++) h.ingestText('draft-' + i + '.md', 'Recovery code draft with no confirmed value.');
    await h.ask('Find the recovery code and calculate seats.');
    const events = store.events(id);
    assert.ok(events.some(e => e.kind === 'inference_request' && e.content === 'retrieval-reranking'));
    for (const result of events.filter(e => e.kind === 'tool_result')) {
      const call = events.find(e => e.kind === 'tool_call' && e.metadata.call_id === result.metadata.call_id);
      assert.equal(result.metadata.request_id, call.metadata.request_id);
      assert.equal(events.find(e => e.id === call.metadata.request_id).content, 'answer');
    }
  } finally { store.close(); }
});

test('Jev ingress classification preserves focused evidence, attribution, uncertainty and full retrieval without promoting state', async () => {
  const store = new Store(undefined, { memory: true });
  let choice = 'constraint', confidence = 0.95;
  const provider = typedProvider(() => ({ choice, confidence }));
  try {
    const id = store.create(), h = new Harness(store, id, { name: 'openai' }, { model: 'gpt-6-luna', budget: 256000, decisionAdapter: new JevDecisionAdapter(provider) });
    h.addMessage('assistant', 'Existing task background '.repeat(2200));
    const content = 'Tentative capacity constraint: 12 seats, unverified.\n' + 'supporting detail\n'.repeat(600);
    const source = await h.ingestDocument('capacity.md', content, 'capacity constraint');
    assert.equal(store.source(id, source.id).content, content);
    assert.ok(store.context(id).segments.some(s => s.source_event_ids.includes(source.id) && /12 seats, unverified/.test(s.content)));
    assert.ok(store.context(id).segments.every(s => !s.state_key));
    assert.equal(store.events(id).findLast(e => e.kind === 'ingress_decision').metadata.classification.category, 'constraint');
    assert.ok(store.events(id).some(e => e.kind === 'inference_request' && e.content === 'ingress-classification'));
    assert.equal(documentIngress(content, '', null).content.length, 320);
    assert.equal(documentIngress(content, '', null, { category: 'constraint' }).content.length, 2000);
    assert.equal(documentIngress(content, 'capacity', { offset: 0 }, { category: 'reference' }).content.length, 2000);
    choice = 'reference'; confidence = 0.3;
    h.options.delegationCache = false;
    const uncertain = await h.ingestDocument('uncertain.md', content, 'capacity constraint');
    assert.equal(store.events(id).findLast(e => e.kind === 'ingress_decision').metadata.selection_source, 'deterministic');
    assert.equal(store.source(id, uncertain.id).actor, 'human');
  } finally { store.close(); }
});

test('delegation respects byte limits, exact model rates and invalid coverage rather than trusting a partial answer', async () => {
  const adapter = new JevDecisionAdapter(typedProvider(() => ({ choice: 'direct' })), { budget: 200, candidates: 6 });
  let called = false;
  const skipped = await adapter.rerank([{ id: 'a', excerpt: 'x'.repeat(600) }], 'q', async () => { called = true; });
  assert.equal(called, false); assert.equal(skipped.fallback, true);
  const normal = new JevDecisionAdapter(typedProvider(() => ({ choice: 'direct' })));
  assert.equal(delegationCost(normal, 'openai', 'unknown', 16000).allowed, false);
  assert.equal(delegationCost(normal, 'openai', 'gpt-6-luna', 1).allowed, false);
  await assert.rejects(normal.rerank([{ id: 'a', excerpt: 'data' }], 'q', async () => ({ answers: {} })), /coverage/);
  const partial = new JevDecisionAdapter(typedProvider((q, i) => ({ choice: i === 2 ? 'direct' : 'irrelevant', confidence: i === 2 ? 0.9 : 0.35 })));
  const candidates = ['uncertain-a', 'uncertain-b', 'direct-source'].map(id => ({ id, excerpt: id }));
  const ranked = await partial.rerank(candidates, 'query', (p) => partial.provider.respond(p));
  assert.deepEqual(ranked.ids, ['direct-source', 'uncertain-a', 'uncertain-b']);
});
