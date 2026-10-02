import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { AnthropicProvider } from '../lib/conclave/provider.js';
import { MAX_TOOL_CALLS_PER_STEP } from '../lib/conclave/agent.js';

const calculate = (id, value) => ({ type: 'function_call', call_id: id,
  name: 'calculate_expression', arguments: JSON.stringify({ expression: `${value}+1` }) });
const batch = Array.from({ length: MAX_TOOL_CALLS_PER_STEP }, (_, i) => calculate(`accepted_${i}`, i));
const final = [{ type: 'message', content: [{ type: 'output_text', text: 'Calculations complete.' }] }];
const step = view => ({ run_id: view.agent.run_id, expected_step: view.agent.steps });

// Exercise the native Claude adapter as well as provider-neutral GPT responses.
function fixture(providerName, store, next) {
  let calls = 0;
  const provider = providerName === 'anthropic' ? new AnthropicProvider({
    apiKey: 'fixture', fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      const output = next(body, ++calls);
      const content = output.map(item => item.type === 'function_call'
        ? { type: 'tool_use', id: item.call_id, name: item.name, input: JSON.parse(item.arguments) }
        : { type: 'text', text: item.content[0].text });
      return new Response(JSON.stringify({ id: `response_${calls}`, model: 'claude-fixture',
        content, stop_reason: content.some(p => p.type === 'tool_use') ? 'tool_use' : 'end_turn',
        usage: { input_tokens: 100, output_tokens: 20 } }),
      { headers: { 'Content-Type': 'application/json' } });
    },
  }) : { name: 'openai', respond: async payload => ({ status: 'completed', model: 'gpt-fixture',
    usage: { input_tokens: 100, output_tokens: 20 }, output: next(payload, ++calls) }) };
  const service = () => new ConclaveService(store, { providerFactory: () => provider,
    availability: () => ({ [providerName]: true, jev: false }) });
  return { service, count: () => calls };
}
function instructions(provider, payload) {
  return provider === 'anthropic' ? payload.system[0].text : payload.instructions;
}
function results(provider, payload) {
  return provider === 'anthropic'
    ? payload.messages.flatMap(m => m.content).filter(p => p.type === 'tool_result')
      .map(p => ({ id: p.tool_use_id, value: JSON.parse(p.content), is_error: p.is_error }))
    : payload.input.filter(p => p.type === 'function_call_output')
      .map(p => ({ id: p.call_id, value: JSON.parse(p.output) }));
}
async function start(service, provider, limits = {}) {
  const id = service.create().conversation_id;
  const view = await service.agentStart(id, { message_id: 'objective', content: 'Calculate independent totals.',
    settings: { provider, model: provider === 'anthropic' ? 'claude-fixture' : 'gpt-fixture' }, limits });
  return { id, view };
}

for (const provider of ['openai', 'anthropic']) {
  test(`${provider}: sixteen calculations execute in one step with an explicit batching instruction`, async () => {
    const store = new Store(undefined, { memory: true });
    try {
      const { service, count } = fixture(provider, store, (payload, n) => {
        assert.match(instructions(provider, payload), /at most 16 tool calls/);
        assert.match(instructions(provider, payload), /wait for results/);
        if (n === 1) return batch;
        const receipts = results(provider, payload);
        assert.equal(receipts.length, 16);
        assert.deepEqual(receipts.map(p => p.value.result), Array.from({ length: 16 }, (_, i) => i + 1));
        return final;
      });
      let { id, view } = await start(service(), provider);
      const request = step(view);
      view = await service().agentStep(id, request);
      assert.equal(view.agent.status, 'running', view.agent.error);
      assert.equal(view.agent.metrics.tool_calls, 16);
      await service().agentStep(id, request);
      assert.equal(count(), 1, 'A repeated browser step must not execute or spend twice');
      view = await service().agentStep(id, step(view));
      assert.equal(view.agent.status, 'completed', view.agent.error);
      assert.equal(count(), 2);
    } finally { store.close(); }
  });

  test(`${provider}: oversized batches resolve every call without writing and recover on a fresh service`, async () => {
    const store = new Store(undefined, { memory: true });
    try {
      const rejected = [{ type: 'function_call', call_id: 'rejected_write', name: 'workspace_write',
        arguments: JSON.stringify({ path: 'unexecuted.md', content: 'Must never be written.' }) },
      ...batch.map(p => ({ ...p, call_id: `rejected_${p.call_id}` }))];
      const { service, count } = fixture(provider, store, (payload, n) => {
        if (n === 1) return rejected;
        const receipts = results(provider, payload).filter(p => p.id.startsWith('rejected_'));
        assert.deepEqual(receipts.map(p => p.id), rejected.map(p => p.call_id));
        assert.ok(receipts.every(p => p.value.code === 'tool_batch_limit' && p.value.executed === false));
        assert.ok(receipts.every(p => p.value.requested_calls === 17 && p.value.max_calls === 16));
        if (provider === 'anthropic') assert.ok(receipts.every(p => p.is_error === true));
        assert.equal(service().view(id).workspace.length, 0);
        if (n === 2) return batch;
        const accepted = results(provider, payload).filter(p => p.id.startsWith('accepted_'));
        assert.equal(accepted.length, 16);
        assert.ok(accepted.every(p => Number.isFinite(p.value.result)));
        return final;
      });
      let { id, view } = await start(service(), provider);
      const request = step(view);
      view = await service().agentStep(id, request);
      assert.equal(view.agent.status, 'running', view.agent.error);
      assert.equal(view.agent.steps, 1);
      assert.equal(view.agent.files.length, 0);
      assert.equal(view.agent.metrics.tool_errors.length, 17);
      assert.equal(store.events(id).filter(e => e.kind === 'agent_tool_batch_limit').length, 1);
      assert.equal(store.events(id).filter(e => e.kind === 'tool_call' && e.metadata.execution_skipped).length, 17);
      await service().agentStep(id, request);
      assert.equal(count(), 1);
      view = await service().agentStep(id, step(view));
      assert.equal(view.agent.status, 'running', view.agent.error);
      view = await service().agentStep(id, step(view));
      assert.equal(view.agent.status, 'completed', view.agent.error);
      assert.equal(view.agent.input_tokens + view.agent.output_tokens, 360, 'Rejected responses remain billed usage');
      assert.equal(count(), 3);
      assert.equal(store.events(id).filter(e => e.kind === 'turn_failure').length, 0);
    } finally { store.close(); }
  });
}

test('repeated oversized batches remain bounded by the existing step allowance', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const oversized = [...batch, calculate('extra', 17)];
    const { service, count } = fixture('openai', store, () => oversized);
    let { id, view } = await start(service(), 'openai', { max_steps: 2 });
    view = await service().agentStep(id, step(view));
    view = await service().agentStep(id, step(view));
    assert.equal(view.agent.status, 'step_limit', view.agent.error);
    assert.equal(view.agent.metrics.tool_errors.length, 34);
    assert.equal(view.agent.input_tokens + view.agent.output_tokens, 240);
    await service().agentStep(id, step(view));
    assert.equal(count(), 2);
  } finally { store.close(); }
});
