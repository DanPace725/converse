// Read-only audit review: no credentials, provider calls or changes to source exports.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Store, hash } from '../lib/conclave/store.js';
import { WorkspaceHarness } from '../lib/conclave/workspace.js';
import { budgetUnits } from '../lib/conclave/harness.js';
import { runMetrics } from '../lib/conclave/agent-diagnostics.js';

const sourceDir = resolve(process.argv[2] || 'test-results');
const outputDir = resolve(process.argv[3] || '.agent-smoke/export-review');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
class ReviewHarness extends WorkspaceHarness {
  answerPayload(pending = []) {
    const payload = super.answerPayload(pending);
    payload.instructions += '\nYou are running an autonomous task. Continue useful tool actions until the objective is complete, then return a final report. A text response without tool calls ends the run after completion checks.';
    return payload;
  }
}
function hydrate(audit, until = Infinity) {
  const store = new Store(undefined, {memory: true});
  const events = audit.events.filter(e => e.seq <= until);
  for (const e of events) store.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?)')
    .run(e.seq, e.id, e.conversation_id, e.kind, e.actor, e.timestamp, e.content, JSON.stringify(e.metadata));
  const ids = new Set(events.map(e => e.id));
  for (const s of audit.snapshots.filter(s => ids.has(s.receipt_id)))
    store.db.prepare('INSERT INTO snapshots VALUES (?,?,?,?)').run(audit.conversation_id, s.revision, JSON.stringify(s.segments), s.receipt_id);
  store.refreshIndex();
  return store;
}
const review = [];
for (const filename of readdirSync(sourceDir).filter(f => f.endsWith('.json')).sort()) {
  const bytes = readFileSync(join(sourceDir, filename));
  const record = JSON.parse(bytes), audit = record.context_layer;
  if (!Array.isArray(audit?.events)) continue;
  const events = audit.events;
  const checkpoints = events.filter(e => e.kind === 'agent_checkpoint');
  const lastRuns = new Map(checkpoints.map(e => [e.metadata.state.run_id, e]));
  const runs = [...lastRuns.values()].map(end => {
    const state = end.metadata.state;
    const runEvents = events.filter(e => e.seq > state.started_after_seq && e.seq <= end.seq);
    const metrics = runMetrics(events, {...state, finished_after_seq: end.seq});
    const requests = runEvents.filter(e => e.kind === 'inference_request');
    const responses = runEvents.filter(e => e.kind === 'inference_response');
    let blocked = null;
    if (state.status === 'token_limit') {
      const inflight = checkpoints.findLast(e => e.seq < end.seq && e.metadata.state.run_id === state.run_id && e.metadata.state.phase === 'inflight');
      const store = hydrate(audit, inflight.seq);
      try {
        const h = new ReviewHarness(store, record.conversation_id, {name: state.settings.provider}, state.settings);
        const payload = h.prepareAnswer(inflight.metadata.state.pending, inflight.metadata.state.protected_ids);
        const units = budgetUnits(payload), used = state.input_tokens + state.output_tokens;
        blocked = {
          method: 'Offline reconstruction of the next answer payload using the last inflight checkpoint and recorded projection; original guard did not log the blocked payload.',
          input_units: units, output_reserve: state.settings.output, used_tokens: used,
          required_allowance: used + units + state.settings.output, limit: state.limits.max_total_tokens,
          projection_message_bytes: budgetUnits(payload.input[0].content), pending_bytes: budgetUnits(inflight.metadata.state.pending),
          byte_to_token_ratios_for_completed_calls: requests.flatMap(req => {
            const res = responses.find(e => e.metadata.request_id === req.id);
            return res?.metadata.usage?.input_tokens ? [req.metadata.estimated_input_units / res.metadata.usage.input_tokens] : [];
          }),
          reconstruction_checks: requests.map(req => {
            const before = checkpoints.findLast(e => e.seq < req.seq && e.metadata.state.run_id === state.run_id && e.metadata.state.phase === 'inflight');
            const saved = hydrate(audit, req.seq - 1);
            try {
              const harness = new ReviewHarness(saved, record.conversation_id, {name: state.settings.provider}, state.settings);
              const actual = budgetUnits(harness.prepareAnswer(before.metadata.state.pending, before.metadata.state.protected_ids));
              return {request_seq: req.seq, recorded_units: req.metadata.estimated_input_units, reconstructed_units: actual, matches: actual === req.metadata.estimated_input_units};
            } finally {saved.close();}
          }),
        };
      } finally {store.close();}
    }
    return {
      run_id: state.run_id, objective: events.find(e => e.id === state.user_event_id)?.content,
      end_seq: end.seq, started_at: state.started_at, ended_at: end.timestamp,
      elapsed_seconds: (Date.parse(end.timestamp) - Date.parse(state.started_at)) / 1000,
      settings: state.settings, limits: state.limits, status: state.status, steps: state.steps,
      input_tokens: state.input_tokens, output_tokens: state.output_tokens, total_tokens: state.input_tokens + state.output_tokens,
      error: state.error || null, metrics, blocked_next_call: blocked,
      requests: requests.map(req => {
        const res = responses.find(e => e.metadata.request_id === req.id);
        return {seq: req.seq, purpose: req.content, input_units: req.metadata.estimated_input_units, input_tokens: res?.metadata.usage?.input_tokens ?? null,
          output_tokens: res?.metadata.usage?.output_tokens ?? null, elapsed_ms: res?.metadata.elapsed_ms ?? null,
          output_types: res?.metadata.output?.map(o => o.type) || [], tools: res?.metadata.output?.filter(o => o.type === 'function_call').map(o => o.name) || []};
      }),
    };
  });
  const documents = events.filter(e => e.kind === 'document' && e.metadata.workspace_path).map(e => {
    const reads = events.filter(r => r.kind === 'workspace_read' && r.metadata.source_event_id === e.id).map(r => ({seq: r.seq, ...r.metadata}));
    let end = 0;
    for (const r of [...reads].sort((a,b) => a.offset - b.offset)) {if (r.offset > end) break; end = Math.max(end, r.end);}
    return {seq: e.seq, source_event_id: e.id, path: e.metadata.workspace_path, characters: e.content.length, sha256: sha256(e.content),
      heading_list: e.content.match(/^#{1,6} .+$/gm), read_ranges: reads, full_readback: end >= e.content.length,
      unread_characters: Math.max(0, e.content.length - end)};
  });
  const toolCalls = events.filter(e => e.kind === 'tool_call'), results = events.filter(e => e.kind === 'tool_result');
  const integrity = {
    tool_calls: toolCalls.length, tool_results: results.length,
    unmatched_tool_calls: toolCalls.filter(c => results.filter(r => r.metadata.call_id === c.metadata.call_id).length !== 1).map(c => c.seq),
    orphan_tool_results: results.filter(r => !toolCalls.some(c => c.metadata.call_id === r.metadata.call_id)).map(r => r.seq),
    snapshot_count: audit.snapshots.length,
    // Only older receipts embed a second copy of the segments to compare.
    snapshot_content_mismatches: audit.snapshots.filter(s => { const copy = events.find(e => e.id === s.receipt_id)?.metadata.segments; return copy && hash(canonical(copy)) !== hash(canonical(s.segments)); }).map(s => s.revision),
    snapshots_without_receipt: audit.snapshots.filter(s => !events.some(e => e.id === s.receipt_id && e.kind === 'context_transform')).map(s => s.revision),
    serialization_hash_unverifiable_revisions: audit.snapshots.filter(s => events.find(e => e.id === s.receipt_id)?.metadata.after_hash !== hash(s.segments)).map(s => s.revision),
    segment_hash_failures: audit.snapshots.flatMap(s => s.segments.filter(b => b.content_hash !== hash(b.content)).map(b => ({revision: s.revision, id: b.id}))),
    dangling_source_ids: [...new Set(audit.snapshots.flatMap(s => s.segments.flatMap(b => b.source_event_ids)).filter(id => !events.some(e => e.id === id)))],
  };
  review.push({filename, sha256: sha256(bytes), conversation_id: record.conversation_id, title: record.title, exported_at: record.exported_at,
    events: events.length, snapshots: audit.snapshots.length, historical_metrics: audit.metrics, runs, documents, integrity,
    failures: events.filter(e => ['inference_failure', 'turn_failure'].includes(e.kind)).map(e => ({seq: e.seq, kind: e.kind, message: e.content})),
    named_state: audit.state,
    attribution_in_requests: events.filter(e => e.kind === 'inference_request').map(e => ({seq: e.seq,
      source_attribution_present: JSON.stringify(e.metadata.payload.input).includes('source_attribution'),
      past_model_names_present: JSON.stringify(e.metadata.payload.input).includes('claude-sonnet-5-5')})),
  });
}
mkdirSync(outputDir, {recursive: true});
writeFileSync(join(outputDir, 'measurements.json'), JSON.stringify(review, null, 2) + '\n');
console.log(JSON.stringify(review.map(r => ({title: r.title, sha256: r.sha256, integrity: r.integrity, documents: r.documents,
  metrics: r.historical_metrics, runs: r.runs.map(({requests, ...run}) => run)})), null, 2));
