import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage, priceUsage, conversationCosts } from '../scripts/lib/costs.js';
import { prices } from '../scripts/report-costs.js';
import { generateCostReports } from '../scripts/report-costs.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
test('Claude normalization has explicit native/export boundaries and cache TTL prices', () => {
  const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 600, cache_creation_input_tokens: 200, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 100 } };
  assert.equal(normalizeUsage(usage, 'anthropic').input, 1000);
  assert.equal(normalizeUsage(usage, 'anthropic', true).input, 1800);
  const cost = priceUsage(usage, 'anthropic', 'claude-sonnet-5-5', prices);
  assert.equal(cost.usd_min, (200 * 2 + 600 * .2 + 100 * 2.5 + 100 * 4 + 100 * 10) / 1e6);
  assert.equal(cost.usd_min, cost.usd_max);
});
test('missing cache buckets/rates remain uncertain and partial usage remains priced', () => {
  const result = priceUsage({ input_tokens: 1000, output_tokens: 100 }, 'openai', 'gpt-6-luna', prices);
  assert.ok(result.usd_min < result.usd_max);
  assert.ok(result.reasons.includes('Cache-write bucket missing'));
  assert.equal(priceUsage({ input_tokens: 1000, output_tokens: 100 }, 'typesafe', 'unknown-jev-version', prices).usd_min, null);
  const report = conversationCosts({ conversation_id: 'conv', context_layer: { events: [
    { id: 'r', seq: 1, kind: 'inference_request', content: 'answer', metadata: { provider: 'openai', payload: { model: 'gpt-6-luna' } } },
    { seq: 2, kind: 'inference_response', metadata: { request_id: 'r', status: 'partial', usage: { input_tokens: 100, output_tokens: 10 } } },
    { id: 'missing', seq: 3, kind: 'inference_request', content: 'compaction', metadata: { provider: 'openai', payload: { model: 'gpt-6-luna' } } },
  ] } }, prices);
  assert.equal(report.priced_calls, 1); assert.equal(report.unpriced_calls, 1);
  assert.ok(report.known_usd_min > 0); assert.equal(report.calls[0].status, 'partial');
});
test('timestamped export snapshots retain trends without doubling latest conversation totals', () => {
  const root = resolve(tmpdir()), dir = mkdtempSync(join(root, 'converse-cost-trends-'));
  try {
    for (const [date, text] of [['2026-10-01T00:00:00Z', 'Old request'], ['2026-10-02T00:00:00Z', 'Corrected request']]) {
      writeFileSync(join(dir, 'conv_' + date.replaceAll(':', '-') + '.json'), JSON.stringify({ conversation_id: 'conv_snapshot', exported_at: date, context_layer: { events: [{ id: 'source', kind: 'user', content: text, metadata: {} }], context: { segments: [{ content: text }] } } }));
    }
    const result = generateCostReports(dir);
    assert.equal(result.snapshots.length, 2); assert.equal(result.conversations.length, 1);
    assert.equal(result.conversations[0].exported_at, '2026-10-02T00:00:00Z');
    assert.equal(result.conversations[0].context.history_characters, 'Corrected request'.length);
  } finally {
    assert.equal(dirname(resolve(dir)), root);
    assert.ok(basename(dir).startsWith('converse-cost-trends-'));
    rmSync(dir, { recursive: true, force: true });
  }
});
test('ordinary exports price native Claude cache usage, title and Gemini thinking without synthetic double counting', () => {
  const result = conversationCosts({ conversation_id: 'ordinary', messages: [
    { message_id: 'user', role: 'user', content: 'Compare this.' },
    { message_id: 'claude', role: 'assistant', provider: 'Claude', model: 'claude-sonnet-5-5', status: 'completed', content: 'A result.', usage: { input_tokens: 200, cache_read_input_tokens: 600, cache_creation_input_tokens: 200, cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 0 }, output_tokens: 100 } },
    { message_id: 'gemini', role: 'assistant', provider: 'Gemini', model: 'gemini-3.8-flash', status: 'completed', content: 'Another result.', usage: { promptTokenCount: 1000, cachedContentTokenCount: 400, candidatesTokenCount: 100, thoughtsTokenCount: 50, totalTokenCount: 1150 } },
  ], title_generation: { usage: { input_tokens: 20, output_tokens: 5, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } }, provenance: { requested_model: 'gpt-6-luna' } } }, prices);
  assert.equal(result.calls.length, 3);
  assert.equal(result.calls[0].counts.input, 1000); assert.equal(result.calls[0].counts.read, 600);
  assert.equal(result.calls[1].counts.output, 150); assert.equal(result.calls[1].counts.input, 1000);
  assert.equal(result.calls[2].purpose, 'title (separately logged)');
  assert.equal(result.priced_calls, 3);
});

test('published Jev price charges only input and leaves missing usage unknown', () => {
  const cost = priceUsage({ input_tokens: 1000000, output_tokens: 9000000 }, 'typesafe', 'jev-latest', prices);
  assert.equal(cost.usd_min, .042); assert.equal(cost.usd_max, .042);
  assert.deepEqual(cost.reasons, []);
  assert.equal(priceUsage(null, 'typesafe', 'jev-latest', prices).usd_min, null);
});
