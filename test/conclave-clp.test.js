import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, ConclaveService } from '../lib/conclave/index.js';
import { toolIngress } from '../lib/conclave/ingress.js';

test('registered CLP model tool carries scoped admitted and unresolved results through a complete turn', async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0;
  try {
    const service = new ConclaveService(store, { availability: () => ({ openai: true, jev: false }), providerFactory: () => ({
      name: 'openai', respond: async payload => {
        calls++;
        assert.ok(payload.tools.some(tool => tool.name === 'query_clp'));
        const output = calls === 1 ? [{ type: 'function_call', call_id: 'clp_fixture', name: 'query_clp', arguments: JSON.stringify({
          frame: ['claim'], keyword: '', min_support: 1, confidence: 0, min_separation: 0, offset: 0,
        }) }] : [{ type: 'message', content: [{ type: 'output_text', text: 'One admitted claim; one unresolved claim.' }] }];
        if (calls === 2) {
          const result = JSON.parse(payload.input.find(item => item.type === 'function_call_output').output);
          assert.equal(result.rows.length, 1);
          assert.equal(result.rows[0].frame, 'claim');
          assert.equal(result.telemetry.unresolved_clusters.length, 1);
          assert.equal(result.telemetry.unresolved_clusters[0].reason, 'support<3 (1)');
          assert.equal(result.explain[0].evidence.confidence, null);
        }
        return { status: 'completed', model: 'gpt-fixture', usage: { input_tokens: 100, output_tokens: 20 }, output };
      },
    }) });
    const conversation = service.create('CLP tool turn').conversation_id;
    await service.clpRegisterFrame(conversation, { name: 'claim', version: '1.0', required_fields: ['text'] });
    const source = store.append(conversation, 'document', 'A primary observation', { source_url: 'https://source.example/report', evidence_scope: 'page-text' }, 'web');
    for (const min_support of [1, 3]) await service.clpRecord(conversation, { frame: 'claim', frame_version: '1.0',
      content: { text: 'An attributed claim' }, source_event_ids: [source.id], resolution: { min_support } });
    const view = await service.ask(conversation, { message_id: 'msg_clp_fixture', content: 'Query the registered claims.',
      settings: { provider: 'openai', model: 'gpt-fixture', jev: false } });
    assert.equal(calls, 2);
    assert.equal(view.messages.at(-1).content, 'One admitted claim; one unresolved claim.');
    const receipt = store.events(conversation).find(event => event.kind === 'tool_result');
    assert.ok(receipt);
    assert.equal(JSON.parse(receipt.content).telemetry.unresolved_clusters.length, 1);
  } finally { store.close(); }
});

test('large CLP receipts retain admitted and unresolved status when exact content is offloaded', () => {
  const result = { version: 'clp-broker-v1', rows: [{ id: 'clp_admitted', frame: 'claim', frame_version: '1.0', content: { text: 'x'.repeat(16000) } }],
    explain: [{ row_id: 'clp_admitted', frame_version: '1.0', frame_event_id: 'evt_frame', why: ['filter.frame', 'resolution.met'],
      resolution_status: 'met', evidence: { support_count: 3, diversity: 3, confidence: null, separation: null } }],
    telemetry: { confidence: 'unmeasured', unresolved_clusters: [{ key: 'clp_thin', frame: 'claim', reason: 'support<3 (1)', explain: { extra: 'canonical' } }] }, next_offset: 4 };
  const projection = toolIngress('query_clp', result, 'evt_receipt');
  assert.equal(projection.changed, true);
  const view = JSON.parse(projection.output);
  assert.equal(view.rows[0].id, 'clp_admitted');
  assert.equal(view.explain[0].evidence.confidence, null);
  assert.equal(view.telemetry.unresolved_clusters[0].reason, 'support<3 (1)');
  assert.equal(view.next_offset, 4);
  assert.equal(view.receipt_event_id, 'evt_receipt');
  assert.equal(view.truncated, true);
  assert.ok(!view.rows[0].content);
  assert.equal(result.rows[0].content.text.length, 16000);
});
