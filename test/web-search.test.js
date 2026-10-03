import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/conclave/store.js';
import { WorkspaceHarness } from '../lib/conclave/workspace.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { SEARCH_LIMIT, nativeSearchPayload, searchEvidence } from '../lib/conclave/web-search.js';
import { AnthropicProvider, anthropicPayload } from '../lib/conclave/provider.js';

const call = { type: 'function_call', name: 'web_search', call_id: 'search_1', arguments: JSON.stringify({ query: 'public report', count: 2 }) };
const response = output => ({ status: 'completed', model: 'fixture', usage: { input_tokens: 100, output_tokens: 20 }, output });
const final = response([{ type: 'message', content: [{ type: 'output_text', text: 'See [the report](https://example.org/report).' }] }]);
const findings = 'Search-derived findings, qualified and uncertain. '.repeat(100);
function searchResponse(provider) {
  const source = { url: 'https://example.org/report', title: 'Public report' };
  return provider === 'openai' ? response([
    { type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [source] } },
    { type: 'message', content: [{ type: 'output_text', text: findings, annotations: [{ type: 'url_citation', ...source }] }] },
  ]) : { ...response([{ type: 'message', content: [{ type: 'output_text', text: findings }] }]), native_output: [
    { type: 'server_tool_use', name: 'web_search', id: 'srv_1', input: { query: 'public report' } },
    { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'web_search_result', ...source, encrypted_content: 'opaque-secret' }] },
    { type: 'text', text: findings, citations: [{ type: 'web_search_result_location', ...source }] },
  ] };
}
function harness(store, id, name = 'openai', respond = async () => searchResponse(name)) {
  return new WorkspaceHarness(store, id, { name, respond }, { webSearch: true, recent: 1, model: name === 'anthropic' ? 'claude-sonnet-5-5' : 'fixture' });
}

test('native search schemas use the existing selected model and bounded native tools', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create();
    for (const name of ['openai', 'anthropic']) {
      const h = harness(store, id, name), payload = nativeSearchPayload(h, 'public report');
      assert.equal(payload.model, h.options.model);
      assert.ok(payload.max_output_tokens <= 8192);
      if (name === 'openai') {
        assert.equal(payload.tools[0].type, 'web_search');
        assert.equal(payload.max_tool_calls, 2);
        assert.ok(payload.include.includes('web_search_call.action.sources'));
      } else {
        const body = anthropicPayload(payload);
        assert.equal(body.tools[0].type, 'web_search_20250305');
        assert.equal(body.tools[0].max_uses, 2);
        assert.equal(body.tools[0].input_schema, undefined);
      }
    }
  } finally { store.close(); }
});

test('returned URLs are normalized and encrypted Claude results stay outside readable evidence', () => {
  for (const name of ['openai', 'anthropic']) {
    const found = searchEvidence(searchResponse(name), name);
    assert.equal(found.citations.length, 1);
    assert.equal(found.citations[0].url, 'https://example.org/report');
    assert.equal(found.evidence_scope, 'search-summary');
    assert.ok(!JSON.stringify(found).includes('opaque-secret'));
  }
  assert.throws(() => searchEvidence(final, 'openai'), /no completed/);
  const broken = searchResponse('anthropic');
  broken.native_output[1].content = { type: 'web_search_tool_result_error', error_code: 'invalid_tool_input' };
  assert.throws(() => searchEvidence(broken, 'anthropic'), /invalid_tool_input/);
  const annotated = searchResponse('openai');
  const part = annotated.output[1].content[0];
  part.text = 'Evidence. [1]';
  Object.assign(part.annotations[0], { start_index: 10, end_index: 13 });
  assert.equal(searchEvidence(annotated, 'openai').content, 'Evidence. [Public report](<https://example.org/report>)');
  assert.equal(part.text, 'Evidence. [1]');
});

test('native Claude response and encrypted blocks are preserved in the inference audit', async () => {
  let body;
  const native = searchResponse('anthropic');
  const provider = new AnthropicProvider({ apiKey: 'fixture-secret', fetchImpl: async (_, options) => {
    body = JSON.parse(options.body);
    return Response.json({ id: 'native_search', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 40, server_tool_use: { web_search_requests: 1 } }, content: native.native_output });
  } });
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = new WorkspaceHarness(store, id, provider, { webSearch: true, model: 'claude-sonnet-5-5' });
    h.addMessage('user', 'Search.');
    const result = await h.executeTool('web_search', { query: 'public report', count: 2 }, []);
    assert.equal(body.tools[0].type, 'web_search_20250305');
    const audit = store.events(id).find(e => e.kind === 'inference_response');
    assert.equal(audit.content, 'web-search');
    assert.equal(audit.metadata.usage.server_tool_use.web_search_requests, 1);
    assert.ok(JSON.stringify(audit.metadata.native_output).includes('opaque-secret'));
    assert.ok(!store.source(id, result.source_event_id).content.includes('opaque-secret'));
  } finally { store.close(); }
});

test('findings survive offload/removal, query reuse avoids calls and task provenance is restored', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(), h = harness(store, id);
    h.pin('Keep the original constraint.'); h.addMessage('user', 'Find a report.'); h.lastRequestId = 'task_request';
    const args = { query: 'public report', count: 2 }, found = await h.executeTool('web_search', args, []);
    assert.equal(h.lastRequestId, 'task_request');
    const source = store.source(id, found.source_event_id);
    assert.equal(source.metadata.evidence_scope, 'search-summary');
    const item = store.context(id).segments.find(s => s.source_event_ids.includes(source.id));
    assert.ok(item.content.length < source.content.length);
    h.addMessage('assistant', 'Found.'); h.offload([item.id], store.context(id).revision, []);
    assert.equal(h.toolResult('retrieve_event', { event_id: source.id, offset: 0 }, []).source_attribution.external_data, true);
    assert.ok(h.toolResult('search_history', { query: 'qualified uncertain' }, []).some(e => e.event_id === source.id));
    assert.equal((await h.executeTool('web_search', args, [])).cache_hit, true);
    assert.equal(store.events(id).filter(e => e.kind === 'inference_request').length, 1);
    store.append(id, 'document_lifecycle', 'remove', { key: 'source:' + source.id, operation: 'remove' }, 'human');
    assert.notEqual((await h.executeTool('web_search', args, [])).source_event_id, source.id);
    assert.ok(store.context(id).segments.some(s => s.pinned));
  } finally { store.close(); }
});

test('failed lookups consume persistent quota, reset on a new turn and preserve task request IDs', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create();
    let h = harness(store, id); h.addMessage('user', 'Search.');
    for (let n = 0; n < SEARCH_LIMIT; n++) {
      h = harness(store, id, 'openai', async () => { throw Error('Search unavailable'); });
      h.lastRequestId = 'task_request';
      await assert.rejects(h.executeTool('web_search', { query: `report ${n}`, count: 1 }, []), /Search unavailable/);
      assert.equal(h.lastRequestId, 'task_request');
    }
    await assert.rejects(h.executeTool('web_search', { query: 'one more', count: 1 }, []), /limit reached/);
    h.addMessage('user', 'New search.');
    await assert.rejects(h.executeTool('web_search', { query: 'report', count: 1 }, []), /Search unavailable/);
  } finally { store.close(); }
});

test('Context and Agent execute a native lookup and include search usage in persisted totals', async () => {
  for (const name of ['openai', 'anthropic']) for (const agent of [false, true]) {
    const store = new Store(undefined, { memory: true });
    try {
      let calls = 0;
      const service = new ConclaveService(store, { availability: () => ({ [name]: true, jev: false }), providerFactory: () => ({ name, respond: async payload => {
        calls++;
        if (payload.tools?.some(t => t.type === 'web_search' || t.type === 'web_search_20250305')) return searchResponse(name);
        if (calls === 1) return response([call]);
        const receipt = JSON.parse(payload.input.find(i => i.type === 'function_call_output').output);
        assert.equal(receipt.citations[0].url, 'https://example.org/report');
        assert.equal(receipt.provider, name);
        return final;
      } }) });
      assert.equal(service.status().web_search, true);
      const id = service.create().conversation_id;
      const input = { content: 'Find a report.', message_id: `msg_${name}`, settings: { provider: name, model: name === 'anthropic' ? 'claude-sonnet-5-5' : 'fixture', jev: false } };
      if (!agent) await service.ask(id, input);
      else {
        let view = await service.agentStart(id, input);
        const step = { run_id: view.agent.run_id, expected_step: view.agent.steps };
        view = await service.agentStep(id, step);
        assert.equal(view.agent.input_tokens, 200);
        assert.equal(view.agent.metrics.usage_by_purpose['web-search'].calls, 1);
        await service.agentStep(id, step);
        assert.equal(calls, 2);
        view = await service.agentStep(id, { run_id: view.agent.run_id, expected_step: view.agent.steps });
        assert.equal(view.agent.status, 'completed');
        assert.equal(view.agent.input_tokens, 300);
      }
      const receipt = store.events(id).find(e => e.kind === 'tool_result');
      const task = store.events(id).find(e => e.kind === 'inference_request' && e.content === 'answer');
      assert.equal(receipt.metadata.request_id, task.id);
      assert.equal(store.events(id).filter(e => e.kind === 'web_search_complete').length, 1);
      assert.equal(calls, 3);
    } finally { store.close(); }
  }
});

test('an Agent search subcall obeys total-token limits before it spends more tokens', async () => {
  const store = new Store(undefined, { memory: true });
  try {
    let calls = 0;
    const service = new ConclaveService(store, { availability: () => ({ openai: true, jev: false }), providerFactory: () => ({ name: 'openai', respond: async () => {
      calls++;
      return { ...response([call]), usage: { input_tokens: 9900, output_tokens: 20 } };
    } }) });
    const id = service.create().conversation_id;
    let view = await service.agentStart(id, { content: 'Search.', message_id: 'msg_limit', settings: { model: 'fixture', output: 1024, jev: false }, limits: { max_total_tokens: 10000 } });
    view = await service.agentStep(id, { run_id: view.agent.run_id, expected_step: 0 });
    assert.equal(calls, 1);
    assert.equal(view.agent.status, 'token_limit');
    assert.equal(view.agent.stop.purpose, 'web-search');
    assert.match(store.events(id).find(e => e.kind === 'tool_result').content, /Total-token limit/);
    assert.equal(store.events(id).filter(e => e.kind === 'document').length, 0);
  } finally { store.close(); }
});
