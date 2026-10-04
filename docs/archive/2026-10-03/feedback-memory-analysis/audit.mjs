// Offline diagnostics only. Reads the export; reproductions use an in-memory DB.
// Run: node docs/archive/2026-10-03/feedback-memory-analysis/audit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Store } from '../../../../../CLA/conclave/src/store.js';
import { extractExplicit, extractionPayload } from '../../../../../CLA/conclave/src/memory-extractor.js';
import { captureMemory } from '../../../../../CLA/conclave/src/memory-controller.js';
import { memoryView, gateStateAuthority } from '../../../../../CLA/conclave/src/memory.js';

const exportURL = new URL('../../../conversations/Feedback on an Uploaded Document_2026-10-03T23-50-55-904Z.json', import.meta.url);
const exported = JSON.parse(fs.readFileSync(exportURL, 'utf8'));
const c = exported.context_layer;
const sources = new Map(c.events.map(e => [e.id, e]));
const ofKind = kind => c.events.filter(e => e.kind === kind);
const economics = ofKind('context_economics');
const captures = ofKind('memory_capture');
const requests = ofKind('inference_request').filter(e => e.content === 'answer');
const extraction = ofKind('inference_request').filter(e => e.content === 'memory-extraction');
const toolCalls = ofKind('tool_call');
const lastDoc = ofKind('document').findLast(e => e.metadata.workspace_path === 'observed-friction.md');
const normalized = text => text.replace(/\r\n/g, '\n').trimEnd();
const docMatches = normalized(fs.readFileSync(new URL('../../../conversations/observed-friction.md', import.meta.url), 'utf8')) === normalized(lastDoc.content);
assert(docMatches, 'Supplied Sonnet document differs from final exported version');

const evidence = {
  conversation_id: exported.conversation_id,
  user_turns: exported.messages.filter(m => m.role === 'user').length,
  events: c.events.length,
  snapshots: c.snapshots.length,
  sonnet_document_matches_final_export: docMatches,
  compaction_calls: c.metrics.compaction_calls,
  offloads: c.metrics.offloads,
  answer_requests: requests.length,
  byte_guard: c.model_input.byte_guard,
  pressure_threshold_bytes: c.model_input.byte_guard * 0.75,
  output_reserve: c.model_input.output_reserve,
  maximum_native_request_bytes: Math.max(...requests.map(e => e.metadata.input_size.bytes)),
  maximum_guard_input_units: Math.max(...requests.map(e => e.metadata.estimated_input_units)),
  shadow: {
    total: economics.length,
    unavailable: economics.filter(e => e.metadata.evaluation_status === 'unavailable').length,
    complete: economics.filter(e => e.metadata.evaluation_status === 'complete').length,
    maximum_elapsed_ms: Math.max(...economics.map(e => e.metadata.elapsed_ms)),
    total_elapsed_ms: economics.reduce((n, e) => n + e.metadata.elapsed_ms, 0),
    available_candidate_counts: economics.filter(e => e.metadata.evaluation_status === 'complete').map(e => e.metadata.candidates.length),
  },
  reviews_with_zero_estimate: ofKind('context_review').filter(e => e.metadata.estimated_input_tokens === 0).length,
  capture_failures: captures.filter(e => e.metadata.status === 'failed').map(e => ({ seq: e.seq, source: sources.get(e.metadata.source_event_id).content, error: e.metadata.error })),
  extraction_requests: extraction.length,
  extraction_responses: ofKind('inference_response').filter(e => e.content === 'memory-extraction').length,
  memory_records: c.memory.records.map(r => ({ id: r.memory_id, content: r.content, kind: r.kind, authority: r.authority, binding: r.binding, lifecycle: r.lifecycle, resolution: r.resolution, source_event_id: r.source_refs[0].event_id })),
  state_retirement_call: toolCalls.filter(e => e.content === 'update_state').map(e => ({ e, args: JSON.parse(e.metadata.arguments) })).find(x => x.args.updates.some(u => u.status === 'superseded')),
  final_budget_state: c.state.entries.find(s => s.state_key === 'budget-new-commitment'),
  observed_friction_patch_attempts: toolCalls.filter(e => e.content === 'workspace_patch' && JSON.parse(e.metadata.arguments).path === 'observed-friction.md').length,
  observed_friction_patch_versions: ofKind('document').filter(e => e.metadata.workspace_path === 'observed-friction.md' && e.metadata.workspace_operation === 'workspace_patch').length,
  tool_errors: ofKind('tool_result').flatMap(e => { try { const out = JSON.parse(e.content); return out.error ? [{seq: e.seq, tool: e.metadata.tool, error: out.error}] : []; } catch { return []; } }),
};
// Keep output bounded; canonical source and full receipts stay in the export.
evidence.state_retirement_call = { seq: evidence.state_retirement_call.e.seq, requested_status: 'superseded' };
evidence.final_budget_state = { ref: evidence.final_budget_state.segmentRef, status: evidence.final_budget_state.status, resolution: evidence.final_budget_state.resolution };

async function replay(texts) {
  const store = new Store(null, { memory: true });
  const conversation = store.create('Offline memory diagnostic');
  const h = { store, conversation, options: { mode: 'layered', memoryModel: false }, memoryCalls: 0 };
  const steps = [];
  for (const content of texts) {
    const event = store.append(conversation, 'user', content, {}, 'human');
    await captureMemory(h, event);
    steps.push({ input: content, explicit_matches: extractExplicit(event).map(r => ({kind: r.kind, content: r.content})), records: memoryView(store, conversation).records.map(r => ({ content: r.content, kind: r.kind, resolution: r.resolution })) });
  }
  store.db.close();
  return steps;
}

const replays = {
  budget_revision: await replay(['Keep the budget under $400', 'I actually want to make it a range, between 400 and 500', 'New commitment: budget should be between $400 and $500']),
  quoted_display: await replay(['Keep the budget under $400', 'Here is the memory display: ```Automatic · claim · I actually want to make it a range, between 400 and 500```']),
  unrelated_revision: await replay(['Keep the budget under $400', 'Keep the route wheelchair accessible', 'Actually, I meant the document title']),
};
const store = new Store(null, { memory: true });
const conversation = store.create();
const event = store.append(conversation, 'user', 'New commitment: budget should be between $400 and $500', {}, 'human');
const update = { key: 'budget', type: 'constraint', content: event.content, source_event_ids: [event.id], status: 'superseded', supersedes: [], conflicts_with: [], supports: [], limitations: [] };
replays.retirement_authority_gate = { requested_status: update.status, effective_status: gateStateAuthority(store, conversation, {segments: []}, [update])[0].status };
replays.extraction_reasoning = extractionPayload(event, [], 'gpt-6.1-sol').reasoning;
store.db.close();
console.log(JSON.stringify({ evidence, replays }, null, 2));
