import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, segment } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { sourceIdentityIndex } from '../lib/conclave/identity.js';
import { auditContextExport } from '../scripts/audit-context-export.js';

test('offloaded originals are discoverable and every page reconstructs the exact source', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const service = new ConclaveService(store);
    const id = service.create().conversation_id, h = service.harness(id);
    h.addMessage('assistant', 'An attributed observation. '.repeat(300));
    const original = store.context(id).segments[0];
    h.offload([original.id]);
    const pointer = store.context(id).segments[0];
    assert.match(pointer.content, /Source excerpt \(not a summary\): "An attributed observation/);
    assert.match(pointer.content, /next_offset/);
    let offset = 0, full = '', pages = 0;
    do {
      const result = h.toolResult('resolve_context', { bundle_id: original.id, offset }, []);
      assert.equal(result.offset, offset);
      assert.equal(result.total_characters, original.content.length);
      assert.equal(result.observed_revision, store.context(id).revision);
      assert.deepEqual(result.source_event_ids, original.source_event_ids);
      assert.equal(result.truncated, true);
      full += result.content; pages++;
      offset = result.next_offset;
    } while (offset !== null);
    assert.ok(pages > 1);
    assert.equal(full, original.content);
    assert.equal(h.toolResult('resolve_context', { bundle_id: original.id }, []).offset, 0);
    for (const bad of [-1, 0.5, original.content.length + 1])
      assert.throws(() => h.toolResult('resolve_context', { bundle_id: original.id, offset: bad }, []), /offset must/);
    const atEnd = h.toolResult('resolve_context', { bundle_id: original.id, offset: original.content.length }, []);
    assert.equal(atEnd.content, ''); assert.equal(atEnd.next_offset, null);
    h.addMessage('assistant', 'Small.');
    assert.throws(() => h.offload([store.context(id).segments.at(-1).id]), /current projection \d+ bytes; proposed \d+ bytes/);
  } finally { store.close(); }
});

test('new and legacy workspace excerpts expose their limits without rewriting history', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const service = new ConclaveService(store), id = service.create().conversation_id, h = service.harness(id);
    const content = '# Full document\n' + 'Detail. '.repeat(1200);
    const file = h.toolResult('workspace_write', { path: 'long.md', content }, []);
    assert.match(store.context(id).segments[0].content, /Partial excerpt: first 2000 characters;/);
    const source = store.source(id, file.source_event_id);
    const old = segment(`Workspace long.md; source ${source.id}.\n${content.slice(0, 2000)}`, [source.id], { type: 'evidence' });
    store.commit(id, [old], 'Legacy snapshot fixture', store.context(id).revision);
    assert.match(h.attributedSegments([old])[0].content, /Partial excerpt/);
    assert.equal(store.context(id).segments[0].content, old.content);
    assert.equal(h.attributedSegments([{ ...old, content: 'Human revised context' }])[0].content, 'Human revised context');
    const first = h.toolResult('workspace_read', { path: 'long.md', offset: 0 }, []);
    const last = h.toolResult('workspace_read', { path: 'long.md', offset: first.next_offset }, []);
    assert.equal(first.total_characters, content.length);
    assert.equal(first.content + last.content, content);
    assert.equal(first.truncated, true); assert.equal(last.next_offset, null);
    assert.equal(h.toolResult('workspace_list', {}, [])[0].observed_revision, store.context(id).revision);
    assert.equal(store.source(id, source.id).content, content);
  } finally { store.close(); }
});

for (const provider of ['openai', 'anthropic']) for (const mode of ['chat', 'agent'])
test(`${provider} ${mode} document writes and patches retain exact inference authors, including legacy recovery`, async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0, conversation;
  const requestedModel = provider === 'anthropic' ? 'claude-requested' : 'gpt-requested';
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, anthropic: true, jev: false }),
    providerFactory: () => ({ name: provider, respond: async () => {
      calls++;
      const current = calls >= 3 ? service.workspaceFile(conversation, 'plan.md') : null;
      const call = (name, args) => [{ type: 'function_call', name, call_id: 'write_' + calls, arguments: JSON.stringify(args) }];
      const output = calls === 1 ? call('workspace_write', { path: 'plan.md', content: '# Plan\nBudget: 100', expected_source_event_id: null }) :
        calls === 2 || calls === 4 ? call('workspace_read', { path: 'plan.md', offset: 0 }) :
        calls === 3 ? call('workspace_patch', { path: 'plan.md', find: '100', replace: '150', expected_source_event_id: current.source_event_id }) :
        [{ type: 'message', content: [{ type: 'output_text', text: 'Verified.' }] }];
      return { status: 'completed', model: 'reported-snapshot', usage: { input_tokens: 10, output_tokens: 10 }, output };
    } }),
  });
  try {
    const id = conversation = service.create().conversation_id;
    const input = { message_id: 'msg_write', content: 'Write, revise and verify.', settings: { provider, model: requestedModel, jev: false } };
    const originalFile = service.workspaceFile.bind(service);
    if (mode === 'chat') await service.ask(id, input);
    else {
      let view = await service.agentStart(id, input);
      while (view.agent.status === 'running') {
        view = await service.agentStep(id, { run_id: view.agent.run_id, expected_step: view.agent.steps });
      }
    }
    const documents = store.events(id).filter(e => e.kind === 'document');
    assert.equal(documents.length, 2);
    for (const doc of documents) {
      assert.equal(doc.metadata.provider, provider);
      assert.equal(doc.metadata.requested_model, requestedModel);
      assert.equal(doc.metadata.model, 'reported-snapshot');
      assert.ok(doc.metadata.inference_request_id);
      assert.ok(doc.metadata.inference_response_event_id);
      assert.ok(doc.metadata.tool_call_id);
    }
    assert.equal(originalFile(id, 'plan.md').source_attribution.model, 'reported-snapshot');
    const legacyEvents = store.events(id).map(e => e.kind === 'document' ? { ...e, metadata: {
      workspace_path: e.metadata.workspace_path, workspace_operation: e.metadata.workspace_operation,
    } } : e);
    const recovered = sourceIdentityIndex(legacyEvents);
    assert.equal(recovered.get(documents[1].id).model, 'reported-snapshot');
    // A mismatched audit call cannot establish model authorship.
    const broken = legacyEvents.map(e => e.kind === 'tool_call' ? { ...e, metadata: { ...e.metadata, call_id: 'unrelated' } } : e);
    assert.equal(sourceIdentityIndex(broken).get(documents[1].id).model, null);
    await service.saveDocument(id, { path: 'plan.md', content: '# Plan\nBudget: 200', expected_source_event_id: documents[1].id });
    assert.equal(originalFile(id, 'plan.md').source_attribution.actor, 'human');
    assert.equal(originalFile(id, 'plan.md').source_attribution.model, undefined);
  } finally { store.close(); }
});

test('export audit checks chronology and detects actual stale requests', () => {
  const request = (seq, revision, ids) => ({ seq, kind: 'inference_request', content: 'answer', metadata: {
    context_revision: revision, payload: { input: [
      { content: `Working context revision ${revision}:\n[]` },
      { content: 'Current saved workspace manifest (latest):\n' + JSON.stringify(ids.map(id => ({ path: id + '.md', source_event_id: id }))) },
    ] },
  } });
  const events = [
    { seq: 1, kind: 'context_transform', metadata: { revision: 1 } }, request(2, 1, []),
    { seq: 3, id: 'a', kind: 'document', actor: 'human', metadata: { workspace_path: 'a.md' } },
    { seq: 4, kind: 'context_transform', metadata: { revision: 2 } }, request(5, 2, ['a']),
  ];
  assert.equal(auditContextExport({ context_layer: { events } }).mismatches.length, 0);
  events.push(request(6, 1, []));
  assert.deepEqual(auditContextExport({ context_layer: { events } }).mismatches.map(m => m.check), ['revision', 'workspace']);
});
