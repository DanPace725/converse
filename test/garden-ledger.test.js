import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';

const response = (output, usage = { input_tokens: 900, output_tokens: 20 }) => ({ status: 'completed', model: 'fixture', usage, output });
const say = (text) => ({ type: 'message', content: [{ type: 'output_text', text }] });
const call = (name, args, id) => ({ type: 'function_call', call_id: 'call_' + id, name, arguments: JSON.stringify(args) });
const service = (store, respond) => new ConclaveService(store, {
  availability: () => ({ openai: true, jev: false }),
  providerFactory: () => ({ name: 'openai', respond }),
});

test('savings ledger counts answer requests, reported input and avoided conversation text', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const conclave = service(store, async () => response([say('Noted.')]));
    const id = conclave.create().conversation_id;
    for (const [index, content] of ['A long project brief. '.repeat(400), 'Second turn.', 'Third turn.'].entries())
      await conclave.ask(id, { message_id: 'msg_' + index, content, settings: { model: 'fixture' } });
    const { savings } = conclave.activity(id);
    assert.equal(savings.requests, 3);
    assert.equal(savings.sent_tokens, 2700);
    assert.equal(savings.management_tokens, 0);
    assert.ok(Number.isSafeInteger(savings.avoided_tokens) && savings.avoided_tokens >= 0);
  } finally { store.close(); }
});

test('text written beside a tool call is kept as that step\'s narration, not as the answer', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    let calls = 0;
    const conclave = service(store, async () => ++calls === 1
      ? response([say("I'll calculate first."), call('calculate', { operation: 'add', values: [1, 2] }, 1)])
      : response([say('The answer is 3.')]));
    const id = conclave.create().conversation_id;
    let view = await conclave.agentStart(id, { conversation_id: id, message_id: 'msg_agent', content: 'Add 1 and 2.', settings: { model: 'fixture' } });
    while (view.agent.status === 'running')
      view = await conclave.agentStep(id, { run_id: view.agent.run_id, expected_step: view.agent.steps });
    const user = view.messages.find((m) => m.role === 'user');
    assert.deepEqual(user.reasoning.map((r) => r.narration), ["I'll calculate first."]);
    assert.equal(view.messages.at(-1).content, 'The answer is 3.');
  } finally { store.close(); }
});
