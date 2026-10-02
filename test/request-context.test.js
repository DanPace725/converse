import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { Harness, budgetUnits } from '../lib/conclave/harness.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { anthropicPayload } from '../lib/conclave/provider.js';

const result = (name, n, output = '{"result":42}') => ({ type: 'function_call_output', call_id: 'call_' + n, output });
const call = (n) => ({ type: 'function_call', name: 'calculate', call_id: 'call_' + n,
  arguments: JSON.stringify({ operation: 'add', values: [40, 2] }) });

test('unchanged Claude exchanges include exactly one context snapshot and preserve signed prefixes', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create('One snapshot');
    const h = new Harness(store, id, { name: 'anthropic' }, { budget: 256000, output: 16384 });
    h.addMessage('user', 'Read this background: ' + 'background '.repeat(3000));
    let pending = [], previous = h.prepareAnswer(pending);
    for (let n = 0; n < 20; n++) {
      pending.push({ type: 'reasoning', anthropic_content: { type: 'thinking', thinking: 'Check arithmetic', signature: 'signed-' + n } }, call(n), result('calculate', n));
      const next = h.prepareAnswer(pending);
      assert.deepEqual(next.input.slice(0, previous.input.length), previous.input);
      assert.equal(next.input.filter(i => i.role === 'user' && i.content.startsWith('Working context revision')).length, 1);
      assert.ok(budgetUnits(next) < budgetUnits(previous) + 2000);
      previous = next;
    }
    assert.equal(store.events(id).filter(e => e.kind === 'continuation_restart').length, 0);
  } finally { store.close(); }
});

test('compacting Claude context replaces old input and carries retrievable completed actions', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create('Shrink');
    const h = new Harness(store, id, { name: 'anthropic' }, { budget: 256000, output: 16384 });
    const old = h.addMessage('assistant', 'OLD LARGE SNAPSHOT '.repeat(2500));
    h.addMessage('user', 'Continue the calculation.');
    const first = h.prepareAnswer([]);
    const receipt = store.append(id, 'tool_result', '{"result":42}', { tool: 'calculate', call_id: 'call_1' });
    h.edit({ expected_revision: store.context(id).revision, remove_ids: [old.item.id],
      additions: [{ content: 'Compact background.', source_event_ids: [old.event.id], type: 'summary', status: 'active' }] });
    const pending = [{ type: 'reasoning', anthropic_content: { type: 'thinking', thinking: '', signature: 'old-signature' } }, call(1), result('calculate', 1)];
    const next = h.prepareAnswer(pending);
    assert.ok(budgetUnits(next) < budgetUnits(first) / 2);
    assert.doesNotMatch(JSON.stringify(next), /OLD LARGE SNAPSHOT|old-signature/);
    assert.match(JSON.stringify(next), /completed_tool_results/);
    assert.ok(JSON.stringify(next).includes(receipt.id));
    assert.equal(h.toolResult('retrieve_event', { event_id: receipt.id, offset: 0 }, []).content, '{"result":42}');
    assert.match(store.source(id, old.event.id).content, /OLD LARGE SNAPSHOT/);
    const continued = h.prepareAnswer([...pending, call(2), result('calculate', 2)]);
    assert.deepEqual(continued.input.slice(0, next.input.length), next.input, 'Pending cursor survives the fresh chain');
  } finally { store.close(); }
});

test('oversized Claude tool history rolls over without replaying completed writes', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create('Rollover');
    const h = new Harness(store, id, { name: 'anthropic' }, { budget: 64000, output: 4096 });
    h.addMessage('user', 'Finish the saved report.');
    h.prepareAnswer([]);
    const text = JSON.stringify({ content: 'large retrieval '.repeat(4000), source_event_id: 'archived' });
    const receipt = store.append(id, 'tool_result', text, { tool: 'workspace_read' });
    const next = h.prepareAnswer([call(1), result('workspace_read', 1, text)]);
    assert.ok(budgetUnits(next) + 4096 < 64000);
    assert.ok(JSON.stringify(next).includes(receipt.id));
    assert.match(JSON.stringify(next), /truncated/);
    assert.equal(store.event(id, receipt.id).content, text);
    assert.equal(store.events(id).filter(e => e.kind === 'continuation_restart').length, 1);
  } finally { store.close(); }
});

for (const mode of ['chat', 'agent']) test(`Jev reviews ${mode} every 10,000 reported input tokens below pressure threshold`, async () => {
  const store = new Store(undefined, { memory: true });
  let reviews = 0, answers = 0;
  const options = {
    availability: () => ({ anthropic: true, jev: true }),
    decisionFactory: () => ({ select: async (plan, segments, query, invoke) => {
      reviews++;
      await invoke({ model: 'jev-fixture', questions: {} }, 'attention-selection', {
        provider: { name: 'typesafe', respond: async () => ({ usage: { input_tokens: 17, output_tokens: 3 } }) }, budget: 8000, output: 0,
      });
      return { decisions: plan.entries.filter(e => !e.protected).map(e => ({ bundle_id: e.bundle_id, action: 'retain', priority: 2, reason: 'still needed' })) };
    } }),
    providerFactory: () => ({ name: 'anthropic', requestPayload: anthropicPayload, respond: async () => {
      answers++;
      return { status: 'completed', usage: { input_tokens: 6000, output_tokens: 50 }, output: answers < 3 ? [call(answers)]
        : [{ type: 'message', content: [{ type: 'output_text', text: '42' }] }] };
    } }),
  };
  try {
    let service = new ConclaveService(store, options);
    const id = service.create('Periodic review').conversation_id;
    const h = service.harness(id);
    for (let n = 0; n < 5; n++) h.addMessage('assistant', 'Earlier material '.repeat(800));
    const input = { message_id: 'periodic', content: 'Calculate twice and finish.', settings: { provider: 'anthropic', model: 'claude-fixture', jev: true } };
    let view;
    if (mode === 'chat') view = await service.ask(id, input);
    else {
      view = await service.agentStart(id, input);
      while (view.agent.status === 'running') {
        service = new ConclaveService(store, options);
        view = await service.agentStep(id, { run_id: view.agent.run_id, expected_step: view.agent.steps });
      }
      assert.equal(view.agent.status, 'completed', view.agent.error);
    }
    assert.equal(reviews, 1, 'Unchanged context/task reuses the persisted selector decision');
    assert.equal(answers, 3);
    assert.equal(view.metrics.decision_calls, 1);
    assert.equal(view.model_input.latest.input_tokens, 6000);
    assert.equal(store.events(id).filter(e => e.kind === 'context_review').length, 2);
    assert.ok(store.events(id).filter(e => e.kind === 'inference_request' && e.content === 'answer').every(e => e.metadata.estimated_input_units < 192000));
    const activity = service.activity(id);
    assert.ok(activity.model_input.next.estimated_tokens > 0);
    assert.equal(activity.model_input.latest.input_tokens, 6000);
    assert.doesNotMatch(JSON.stringify(activity), /questions|signature|apiKey/);
  } finally { store.close(); }
});

test('full input size includes instructions, tools, metadata and the latest user; previews do not mutate audit', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const service = new ConclaveService(store);
    const id = service.create('Input').conversation_id;
    const h = service.harness(id);
    h.addMessage('user', 'Latest user message.', {}, { web_settings: { provider: 'anthropic', model: 'claude-fixture' } });
    const before = store.events(id).length;
    const stats = service.modelInput(id);
    assert.ok(stats.next.bytes > 5000);
    assert.ok(stats.next.estimated_tokens > 1000, 'Whole request is much larger than the 19-character user text');
    assert.equal(stats.latest, null);
    assert.equal(store.events(id).length, before);
  } finally { store.close(); }
});
