import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store, segment } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { AnthropicProvider, OpenAIProvider, anthropicPayload } from '../lib/conclave/provider.js';
import { tokenize, inputSize, countInput } from '../lib/conclave/input-size.js';
import { contextAudit } from '../lib/conclave/telemetry.js';

test('removal excludes all document versions, file-read copies, derived context and old pointers; restore retains audit', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const service = new ConclaveService(store), id = service.create('Removal').conversation_id;
    await service.uploadDocument(id, { name: 'source.md', content: '# Evidence\nsecretword' });
    const first = service.workspaceFile(id, 'source.md');
    await service.saveDocument(id, { path: 'source.md', content: '# Evidence\nsecretword revised', expected_source_event_id: first.source_event_id });
    const file = service.workspaceFile(id, 'source.md'), h = service.harness(id);
    const bundle = store.context(id).segments.find(s => s.source_event_ids.includes(file.source_event_id));
    const copy = store.append(id, 'tool_result', JSON.stringify(h.toolResult('workspace_read', { path: file.path, offset: 0 })), { tool: 'workspace_read' });
    const pinned = segment('Derived secretword', [first.source_event_id], { pinned: true });
    store.commit(id, [...store.context(id).segments, pinned], 'Pin fixture', store.context(id).revision);
    await assert.rejects(service.changeDocument(id, { operation: 'remove', path: file.path, expected_source_event_id: first.source_event_id }), /version changed/);
    const removed = await service.changeDocument(id, { operation: 'remove', path: file.path, expected_source_event_id: file.source_event_id });
    assert.equal(removed.workspace.length, 0);
    assert.equal(h.toolResult('search_history', { query: 'secretword' }).length, 0);
    assert.throws(() => h.toolResult('workspace_read', { path: file.path, offset: 0 }), /not found/);
    for (const event_id of [first.source_event_id, file.source_event_id, copy.id])
      assert.throws(() => h.toolResult('retrieve_event', { event_id, offset: 0 }), /removed/);
    assert.throws(() => h.toolResult('resolve_context', { bundle_id: bundle.id, offset: 0 }), /removed/);
    assert.throws(() => h.toolResult('edit_context', { expected_revision: removed.context.revision, remove_ids: [], additions: [{ content: 'Revive', source_event_ids: [first.source_event_id], type: 'summary', status: 'active' }] }), /removed/);
    assert.doesNotMatch(JSON.stringify(h.answerPayload()), /secretword/);
    assert.match(JSON.stringify(service.export(id)), /secretword/);
    const reloaded = new ConclaveService(store);
    assert.equal(reloaded.view(id).removed_documents.length, 1);
    await reloaded.changeDocument(id, { operation: 'restore', path: file.path, expected_change_id: removed.removed_documents[0].change_id });
    assert.equal(reloaded.workspaceFile(id, file.path).content, file.content);
    assert.equal(h.toolResult('search_history', { query: 'secretword' }).length, 2);
    assert.equal(store.event(id, first.source_event_id).content, first.content);
    assert.equal(store.context(id).segments.length, 0, 'restore does not reinsert discarded working context');
  } finally { store.close(); }
});

test('composer originals can be removed and removal is blocked during a running agent', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const service = new ConclaveService(store), id = service.create('Original').conversation_id;
    const source = service.harness(id).ingestText('original.md', 'Original evidence', '', { attachment_id: 'a', filename: 'original.md' });
    const doc = store.events(id).find(e => e.kind === 'document');
    const view = await service.changeDocument(id, { operation: 'remove', source_event_id: doc.id, expected_source_event_id: doc.id });
    assert.equal(view.attachments.length, 0);
    await service.agentStart(id, { message_id: 'run', content: 'Wait', settings: { model: 'fixture', jev: false } });
    await assert.rejects(service.changeDocument(id, { operation: 'restore', source_event_id: doc.id, expected_change_id: view.removed_documents[0].change_id }), /Stop the agent/);
    assert.ok(source);
  } finally { store.close(); }
});

test('Claude native effort survives structured format and legacy defaults normalize without accepting unsupported values', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const service = new ConclaveService(store);
    const settings = service.settings({ provider: 'anthropic', model: 'claude-sonnet-5-5', reasoning: 'xhigh' });
    assert.equal(settings.reasoning, 'xhigh');
    assert.equal(service.settings({ provider: 'anthropic', model: 'claude-sonnet-5-5', reasoning: 'none' }).reasoning, 'default');
    assert.throws(() => service.settings({ provider: 'anthropic', model: 'claude-haiku-4-5', reasoning: 'high' }), /unsupported/);
    const native = anthropicPayload({ model: settings.model, input: [{ role: 'user', content: 'Test' }], instructions: 'System', max_output_tokens: 4096,
      reasoning: { effort: settings.reasoning, summary: 'auto' }, text: { format: { type: 'json_schema', schema: { type: 'object' } } } });
    assert.equal(native.output_config.effort, 'xhigh');
    assert.equal(native.output_config.format.type, 'json_schema');
    assert.equal(native.thinking.type, 'adaptive');
  } finally { store.close(); }
});

test('local Unicode tokenization differs from byte ratios; native counters handle signed blocks and safe failures', async () => {
  assert.equal(tokenize('hello world'), 2);
  const payload = { model: 'claude-sonnet-5-5', instructions: 'System', input: [{ role: 'user', content: '你好 🌱 <|endoftext|>' }], max_output_tokens: 4096, reasoning: { effort: 'medium', summary: 'auto' } };
  let body;
  const provider = new AnthropicProvider({ apiKey: 'fixture-key', fetchImpl: async (url, options) => {
    assert.match(url, /messages\/count_tokens$/); body = JSON.parse(options.body);
    return new Response(JSON.stringify({ input_tokens: 123 }));
  } });
  const local = inputSize(payload, provider);
  assert.equal(local.tokenizer_tokens, tokenize(JSON.stringify((({ max_tokens, ...rest }) => rest)(provider.requestPayload(payload)))));
  const counted = await countInput(payload, provider);
  assert.equal(counted.provider_count, 123);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.output_config.effort, 'medium');
  assert.equal(body.messages[0].content[0].text, '你好 🌱 <|endoftext|>');
  assert.match(counted.method, /anthropic-preflight-estimate/);
  const failure = await countInput(payload, { name: 'anthropic', countTokens: async () => { throw Error('fixture-secret'); } });
  assert.doesNotMatch(JSON.stringify(failure), /fixture-secret/);
  assert.match(failure.error, /failed/);
  // Use the native adapter method without reading environment credentials.
  await OpenAIProvider.prototype.countTokens.call({ key: 'fixture', fetch: async (url, options) => {
    assert.match(url, /responses\/input_tokens$/);
    const request = JSON.parse(options.body);
    assert.equal(request.max_output_tokens, undefined);
    assert.equal(request.instructions, 'System');
    return new Response(JSON.stringify({ input_tokens: 10 }));
  } }, { ...payload, model: 'gpt-6-luna' });
});

test('provider counts are reused only for identical saved inputs, and read-only audit/help do not expose native payloads', async () => {
  const store = new Store(undefined, { memory: true });
  let counts = 0;
  try {
    const provider = { name: 'openai', countTokens: async () => { counts++; return { input_tokens: 4321 }; } };
    const service = new ConclaveService(store, { providerFactory: () => provider }), id = service.create('Count').conversation_id;
    const h = service.harness(id);
    h.addMessage('user', 'Count this');
    await service.countTokens(id);
    assert.equal(service.modelInput(id).next.provider_count, 4321);
    await service.countTokens(id);
    assert.equal(counts, 1);
    h.addMessage('user', 'Changed request');
    assert.equal(service.modelInput(id).next.provider_count, null);
    await service.countTokens(id);
    assert.equal(counts, 2);
    store.append(id, 'inference_request', 'answer', { payload: { model: 'fixture', private: 'opaque-secret' }, provider: 'openai' });
    const before = store.events(id).length;
    const guide = h.toolResult('read_app_guide', { offset: 0 });
    assert.equal(guide.content, readFileSync(new URL('../public/app-guide.md', import.meta.url), 'utf8').slice(0, 8000));
    const audit = contextAudit(store, id, { limit: 2, kind: 'all' });
    assert.equal(audit.records.length, 2);
    assert.doesNotMatch(JSON.stringify(audit), /opaque-secret|payload|signature/);
    const telemetry = h.toolResult('read_telemetry', { after_seq: 0, limit: 2, kind: 'all' });
    assert.equal(telemetry.byte_guard, 256000);
    assert.equal(store.events(id).length, before);
    assert.throws(() => contextAudit(store, id, { limit: 100 }), /Invalid/);
  } finally { store.close(); }
});
