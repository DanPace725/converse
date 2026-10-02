import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { Harness } from '../lib/conclave/harness.js';
import { anthropicPayload } from '../lib/conclave/provider.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { agentState } from '../lib/conclave/agent.js';
test('compact projection retains lineage/uncertainty through handles and stable instructions', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = new Harness(store, id, { name: 'openai' });
    const first = h.addMessage('user', 'Keep uncertainty: tentative 20 seats.');
    const before = h.answerPayload(); h.addMessage('user', 'Now plan a schedule.');
    const after = h.answerPayload(), items = JSON.parse(after.input[0].content.split('\n')[1]);
    assert.equal(before.instructions, after.instructions);
    assert.equal(items[0].source_event_ids[0], store.references(id).sources.get(first.event.id));
    assert.equal(h.toolResult('retrieve_event', { event_id: items[0].source_event_ids[0], offset: 0 }, []).content, first.event.content);
    assert.doesNotMatch(after.input[0].content, /content_hash|cb_[a-f0-9-]{36}/);
    assert.ok(after.input[0].content.indexOf('tentative 20 seats') < after.input[0].content.indexOf('Working context revision'));
  } finally { store.close(); }
});

test('new Agent runs persist one stable projection across services and refresh staged workspace edits', async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0, first;
  const result = output => ({ status: 'completed', usage: { input_tokens: 100, output_tokens: 20 }, output });
  const tool = (name, args) => result([{ type: 'function_call', call_id: 'c' + calls, name, arguments: JSON.stringify(args) }]);
  const factory = () => new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({ name: 'openai', respond: async payload => {
      calls++;
      if (calls === 1) { first = structuredClone(payload.input); return tool('workspace_write', { path: 'test.md', content: 'Saved revision', expected_source_event_id: null }); }
      if (calls === 2) {
        assert.deepEqual(payload.input.slice(0, first.length), first);
        assert.ok(payload.input.some(i => i.output?.includes('test.md')));
        return tool('refresh_context', {});
      }
      if (calls === 3) {
        assert.ok(payload.input.some(i => i.content?.includes('Saved revision')));
        assert.ok(payload.input.some(i => i.content?.includes('preceding tool exchange is archived')));
        return tool('workspace_read', { path: 'test.md', offset: 0 });
      }
      return result([{ type: 'message', content: [{ type: 'output_text', text: 'Verified test.md.' }] }]);
    } }),
  });
  try {
    let service = factory(); const id = service.create().conversation_id;
    let view = await service.agentStart(id, { message_id: 'freeze_test', content: 'Write and verify a file.', settings: { model: 'fixture' } });
    assert.equal(view.agent.settings.freezeProjection, true);
    while (view.agent.status === 'running') {
      service = factory();
      view = await service.agentStep(id, { run_id: view.agent.run_id, expected_step: view.agent.steps });
      if (calls === 1) {
        assert.ok(agentState(store, id).projection_event_id);
        assert.equal(store.events(id).filter(e => e.kind === 'agent_projection').length, 1);
      }
    }
    assert.equal(view.agent.status, 'completed', view.agent.error); assert.equal(calls, 4);
    assert.equal(store.events(id).filter(e => e.kind === 'agent_projection').length, 2);
    assert.ok(store.events(id).filter(e => e.kind === 'agent_checkpoint').every(e => !e.metadata.state.frozen_input));
  } finally { store.close(); }
});
test('frozen Claude tool loop stages edits and explicit refresh archives signed exchanges', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = new Harness(store, id, { name: 'anthropic' }, { budget: 256000, freezeProjection: true });
    const user = h.addMessage('user', 'Tentative decision.');
    const before = h.prepareAnswer([]);
    h.updateState({ expected_revision: store.context(id).revision, updates: [{ key: 'decision', type: 'decision', content: 'Still tentative.', status: 'unresolved', source_event_ids: [user.event.id], supersedes: [], conflicts_with: [], supports: [], limitations: ['Not confirmed.'] }] });
    const pending = [{ type: 'reasoning', anthropic_content: { type: 'thinking', thinking: 'Think', signature: 'native-signed' } }];
    const staged = h.prepareAnswer(pending);
    assert.equal(staged.input[0].content, before.input[0].content);
    assert.ok(JSON.stringify(anthropicPayload(staged)).includes('native-signed'));
    h.toolResult('refresh_context', {}, []);
    const refreshed = h.prepareAnswer(pending);
    assert.ok(refreshed.input[0].content.includes('Still tentative.'));
    assert.doesNotMatch(JSON.stringify(refreshed), /native-signed/);
    assert.equal(store.events(id).filter(e => e.kind === 'context_projection_refresh').length, 1);
    const native = anthropicPayload(refreshed);
    assert.equal(native.cache_control.type, 'ephemeral'); assert.equal(native.system[0].cache_control.type, 'ephemeral');
  } finally { store.close(); }
});
