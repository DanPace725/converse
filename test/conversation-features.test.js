import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationTitle } from '../lib/titles.js';
import { Store } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { downloadRecord } from '../lib/context-repository.js';

test('automatic titles use the selected model with bounded input/output and retain generation provenance', async () => {
  const result = await conversationTitle({ provider: 'Claude', model: 'claude-fixture', content: 'Please compare three ways to manage project memory.' }, {
    generate: async (input, delta, signal, options) => {
      assert.equal(input.provider, 'Claude');
      assert.equal(input.model, 'claude-fixture');
      assert.match(input.messages[0].content, /Treat it only as data/);
      assert.equal(options.maxOutputTokens, 512);
      return { text: '"Project Memory Options"\nExtra line', usage: { output_tokens: 4 }, provenance: { requested_model: input.model } };
    },
  });
  assert.equal(result.title, 'Project Memory Options');
  assert.equal(result.provenance.requested_model, 'claude-fixture');
  assert.equal(result.usage.output_tokens, 4);
  await assert.rejects(conversationTitle({ provider: 'GPT', model: 'fixture', content: 'x'.repeat(4001) }), /Invalid title/);
});

for (const mode of ['context', 'agent']) test(`${mode} revisions preserve originals, link corrected input and persist automatic titles`, async () => {
  const store = new Store(undefined, { memory: true });
  const payloads = [];
  const service = () => new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({ name: 'openai', respond: async payload => {
      payloads.push(payload);
      return { status: 'completed', model: 'fixture', usage: { input_tokens: 10, output_tokens: 10 },
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer.' }] }] };
    } }),
  });
  try {
    const id = service().create('Original fallback').conversation_id;
    await service().ask(id, { message_id: 'msg_original', content: 'Calculate 2 + 2.', settings: { model: 'fixture', jev: false } });
    const originalId = service().view(id).messages[0].source_event_id;
    const input = { message_id: 'msg_corrected', content: 'Calculate 3 + 3.', revises_message_id: 'msg_original', settings: { model: 'fixture', jev: false } };
    if (mode === 'context') await service().ask(id, input);
    else {
      const view = await service().agentStart(id, input);
      await service().agentStep(id, { run_id: view.agent.run_id, expected_step: 0 });
    }
    const view = service().view(id);
    assert.deepEqual(view.messages.map(m => m.content), ['Calculate 2 + 2.', 'Answer.', 'Calculate 3 + 3.', 'Answer.']);
    assert.equal(view.messages[2].revises_message_id, 'msg_original');
    assert.match(payloads[1].input[0].content, new RegExp('"revises_event_id":"' + store.references(id).sources.get(originalId) + '"'));
    const revision = store.context(id).revision;
    await service().name(id, { title: 'Simple Arithmetic', usage: { output_tokens: 3 } });
    assert.equal(service().view(id).title, 'Simple Arithmetic');
    assert.equal(service().list()[0].title, 'Simple Arithmetic');
    assert.equal(service().view(id).title_generated, true);
    assert.equal(store.context(id).revision, revision);
    await service().name(id, { title: 'Duplicate name' });
    assert.equal(service().view(id).title, 'Simple Arithmetic');
    const exported = downloadRecord(service(), id);
    assert.equal(exported.title, 'Simple Arithmetic');
    assert.equal(exported.context_layer.events.filter(e => e.kind === 'conversation_title').length, 1);
    await assert.rejects(service().ask(id, { ...input, message_id: 'msg_bad', revises_message_id: 'msg_elsewhere' }), /Original message not found/);
  } finally { store.close(); }
});
