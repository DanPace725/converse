import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { checkAttribution } from '../lib/conclave/state.js';

test('source attribution accepts reordered JSON fields and rejects changed identity', () => {
  const source = { id: 'evt_fixture', kind: 'user', actor: 'human' };
  const store = { source: () => source };
  const item = { source_event_ids: [source.id], attribution: [{ kind: 'user', actor: 'human', event_id: source.id }] };
  assert.doesNotThrow(() => checkAttribution(store, 'conv_fixture', item));
  item.attribution[0].actor = 'openai';
  assert.throws(() => checkAttribution(store, 'conv_fixture', item), /attribution differs/);
  item.attribution[0].actor = 'human';
  item.attribution[0].extra = true;
  assert.throws(() => checkAttribution(store, 'conv_fixture', item), /attribution differs/);
});

test('a failed user projection records a linked turn failure before any inference', async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0;
  try {
    const service = new ConclaveService(store, {
      availability: () => ({ openai: true, jev: false }),
      providerFactory: () => ({ name: 'openai', respond: async () => { calls++; throw Error('Unexpected inference'); } }),
    });
    const id = service.create('Projection failure fixture').conversation_id;
    store.commit = () => { throw Error('Fixture projection failure'); };
    await assert.rejects(service.ask(id, { message_id: 'msg_failure', content: 'Continue.', settings: { jev: false } }), /Fixture projection failure/);
    const events = store.events(id), user = events.find((e) => e.kind === 'user');
    assert.equal(events.find((e) => e.kind === 'turn_failure').metadata.user_event_id, user.id);
    assert.equal(service.view(id).messages[0].answer_failed, true);
    assert.equal(service.view(id).metrics.failures, 1);
    assert.equal(calls, 0);
  } finally { store.close(); }
});
