import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, segment } from '../lib/conclave/store.js';
import { Harness } from '../lib/conclave/harness.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { anthropicPayload } from '../lib/conclave/provider.js';

const reply = (model, text) => ({
  status: 'completed', model, usage: { input_tokens: 10, output_tokens: 10 },
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
});
const projection = payload => JSON.parse(payload.input[0].content.split('\n')[1]);
const settings = (provider, model) => ({ provider, model, jev: false });

for (const mode of ['context', 'agent']) {
  test(`${mode} switches GPT to Claude and back with current identity and historical authors`, async () => {
    const store = new Store(undefined, { memory: true });
    const requests = [];
    const service = () => new ConclaveService(store, {
      availability: () => ({ openai: true, anthropic: true, jev: false }),
      providerFactory: provider => ({ name: provider, respond: async payload => {
        requests.push(payload);
        if (provider === 'anthropic') {
          // Verify the attribution survives the actual Messages API conversion.
          const native = anthropicPayload(payload);
          assert.match(native.system, /provider=anthropic; requested model=claude-fixture/);
          assert.match(native.messages[0].content[0].text, /gpt-fixture-snapshot/);
          assert.match(native.messages[0].content[0].text, /"provider":"openai"/);
          return reply('claude-fixture-snapshot', 'Claude reviews the GPT design.');
        }
        return reply('gpt-fixture-snapshot', requests.length === 1 ? 'I propose a design.' : 'GPT follows up.');
      } }),
    });
    try {
      const id = service().create('Mixed-model attribution').conversation_id;
      const send = async (message_id, content, selection) => {
        const input = { message_id, content, settings: selection };
        if (mode === 'context') return service().ask(id, input);
        const started = await service().agentStart(id, input);
        return service().agentStep(id, { run_id: started.agent.run_id, expected_step: 0 });
      };
      await send('msg_gpt', 'Propose a design.', settings('openai', 'gpt-fixture'));
      await send('msg_claude', 'Which model are you, and review the earlier design.', settings('anthropic', 'claude-fixture'));
      await send('msg_gpt_again', 'Review the Claude response.', settings('openai', 'gpt-fixture'));
      assert.equal(requests.length, 3);
      for (const payload of requests) {
        assert.doesNotMatch(payload.instructions, /You are Conclave/);
        assert.match(payload.instructions, /Conclave is Converse's method for managing shared context/);
        assert.match(payload.instructions, /Only prior replies with your provider AND current model/);
      }
      assert.match(requests[2].instructions, /provider=openai; requested model=gpt-fixture/);
      const first = projection(requests[1]).find(s => s.type === 'assistant');
      assert.deepEqual(first.source_attribution, [{
        event_id: first.source_event_ids[0], kind: 'assistant', actor: 'openai',
        provider: 'openai', model: 'gpt-fixture-snapshot', requested_model: 'gpt-fixture', reported_model: 'gpt-fixture-snapshot',
      }]);
      const previous = projection(requests[2]).filter(s => s.type === 'assistant');
      assert.deepEqual(previous.map(s => s.source_attribution[0].provider), ['openai', 'anthropic']);
      assert.equal(previous[1].source_attribution[0].model, 'claude-fixture-snapshot');
      const originals = store.events(id).filter(e => e.kind === 'assistant');
      assert.equal(originals[1].metadata.requested_model, 'claude-fixture');
      assert.equal(originals[1].metadata.model, 'claude-fixture-snapshot');
      // Attribution is a request-time view; canonical text and snapshots stay intact.
      assert.equal(originals[0].content, 'I propose a design.');
      assert.equal(store.context(id).segments[1].source_attribution, undefined);
    } finally { store.close(); }
  });
}

test('legacy source attribution survives summaries, structured state, offloading and retrieval without inventing models', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create('Legacy attribution');
    const user = store.append(id, 'user', 'Design a record.', {}, 'human');
    const request = store.append(id, 'inference_request', 'answer', { provider: 'openai', payload: { model: 'gpt-older' } });
    store.append(id, 'inference_response', 'answer', { request_id: request.id, model: 'gpt-older-snapshot' }, 'openai');
    const gpt = store.append(id, 'assistant', 'My design uses two dates.', {}, 'openai');
    store.append(id, 'turn_complete', '', { user_event_id: user.id, assistant_event_id: gpt.id });
    const unknown = store.append(id, 'assistant', 'Unattributed model suggestion.', {}, 'anthropic');
    const raw = [user, gpt, unknown].map(e => segment(e.content, [e.id], { type: e.kind }));
    store.commit(id, raw, 'legacy fixture', 0);
    const h = new Harness(store, id, { name: 'anthropic' }, { model: 'claude-current', budget: 256000 });
    let projected = projection(h.answerPayload());
    assert.equal(projected[1].source_attribution[0].model, 'gpt-older-snapshot');
    assert.equal(projected[2].source_attribution[0].model, null);
    assert.equal(projected[2].source_attribution[0].requested_model, null);
    h.edit({ expected_revision: 1, remove_ids: raw.filter(s => s.type !== 'user').map(s => s.id), additions: [{
      type: 'summary', status: 'active', content: 'GPT proposed two dates; another model offered a suggestion. '.repeat(20),
      source_event_ids: [gpt.id, unknown.id],
    }] });
    h.updateState({ expected_revision: 2, updates: [{
      key: 'proposal', type: 'decision', content: 'GPT proposed two dates.', source_event_ids: [gpt.id],
      status: 'unresolved', supersedes: [], conflicts_with: [], supports: [], limitations: ['Assistant proposal.'],
    }] });
    projected = projection(h.answerPayload());
    assert.deepEqual(projected[1].source_attribution.map(a => a.provider), ['openai', 'anthropic']);
    assert.equal(projected[2].source_attribution[0].requested_model, 'gpt-older');
    const summary = store.context(id).segments[1];
    h.offload([summary.id], 3);
    assert.equal(projection(h.answerPayload())[2].source_attribution[0].provider, 'openai');
    const resolved = h.toolResult('resolve_context', { bundle_id: summary.id }, []);
    assert.equal(resolved.source_attribution[0].model, 'gpt-older-snapshot');
    for (const result of [
      h.toolResult('retrieve_event', { event_id: gpt.id, offset: 0 }, []),
      ...h.toolResult('search_history', { query: 'two dates' }, []),
      ...h.toolResult('retrieve_range', { start_seq: gpt.seq, end_seq: gpt.seq }, []).results,
    ]) {
      assert.equal(result.source_attribution.provider, 'openai');
      assert.equal(result.source_attribution.model, 'gpt-older-snapshot');
    }
    // Even a newer GPT model must not receive the earlier GPT version as its own assistant turn.
    const append = new Harness(store, id, { name: 'openai' }, { model: 'gpt-newer', mode: 'append' });
    assert.ok(append.input().every(m => m.role === 'user'));
    append.options.model = 'gpt-older';
    assert.equal(append.input()[1].role, 'assistant');
    assert.equal(append.input()[2].role, 'user');
    assert.deepEqual(store.source(id, gpt.id).metadata, {});
  } finally { store.close(); }
});

test('semantic compaction receives source authors alongside historical text', async () => {
  const store = new Store(undefined, { memory: true });
  let compactionCalls = 0;
  try {
    const id = store.create('Compaction attribution');
    const provider = { name: 'anthropic', respond: async payload => {
      compactionCalls++;
      assert.match(payload.input[0].content, /Preserve speaker\/provider\/model attribution/);
      const selected = JSON.parse(payload.input[0].content.split('\n').at(-1));
      assert.equal(selected[0].source_attribution[0].provider, 'openai');
      assert.equal(selected[0].source_attribution[0].model, 'gpt-old');
      return reply('claude-current', JSON.stringify({ additions: [{
        content: 'GPT proposed a design.', type: 'summary', status: 'active',
        source_event_ids: selected.flatMap(s => s.source_event_ids),
      }] }));
    } };
    const h = new Harness(store, id, provider, { model: 'claude-current', budget: 256000, recent: 1 });
    const older = store.append(id, 'assistant', 'I propose a design. '.repeat(300), { provider: 'openai', requested_model: 'gpt-old' }, 'openai');
    store.commit(id, [segment(older.content, [older.id], { type: 'assistant' })], 'seed', 0);
    h.addMessage('user', 'Continue.');
    const result = await h.compact([], true);
    assert.equal(result.status, 'compacted');
    assert.equal(compactionCalls, 1);
    assert.equal(projection(h.answerPayload()).at(-1).source_attribution[0].provider, 'openai');
  } finally { store.close(); }
});
