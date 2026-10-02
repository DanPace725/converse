import { tokenize } from './input-size.js';
const contextKinds = new Set(['decision_proposal', 'decision_rejection', 'attention_decision', 'context_review',
  'context_transform', 'context_skip', 'context_rejection', 'budget_recovery', 'token_count']);
const textCounts = new Map();
function snapshotTokens(store, conversation, revision) {
  if (revision == null) return null;
  const snapshot = store.snapshot(conversation, revision);
  const key = conversation + ':' + revision + ':' + snapshot.receipt_id;
  if (!textCounts.has(key)) {
    if (textCounts.size >= 256) textCounts.delete(textCounts.keys().next().value);
    textCounts.set(key, snapshot.segments.reduce((n, s) => n + tokenize(s.content), 0));
  }
  return textCounts.get(key);
}
export function contextAudit(store, conversation, { after_seq = 0, limit = 12, kind = 'all' } = {}) {
  if (!Number.isSafeInteger(after_seq) || after_seq < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 30
    || !['all', 'context', 'workspace', 'history', 'calculation', 'task'].includes(kind)) throw Error('Invalid audit filter');
  const events = store.events(conversation);
  const requests = new Map(events.filter(e => e.kind === 'inference_request').map(e => [e.id, e]));
  const calls = new Map(events.filter(e => e.kind === 'tool_call').map(e => [e.metadata.call_id, e]));
  const type = e => contextKinds.has(e.kind) ? 'context' : e.kind === 'document_lifecycle' ? 'workspace'
    : ['tool_call', 'tool_result'].includes(e.kind) ? (e.metadata.tool || e.content).startsWith('workspace_') ? 'workspace'
      : (e.metadata.tool || e.content) === 'calculate' ? 'calculation'
      : /history|retrieve|resolve/.test(e.metadata.tool || e.content) ? 'history' : 'context'
    : /^inference_|^turn_/.test(e.kind) ? 'task' : null;
  const filtered = events.filter(e => e.seq > after_seq && type(e) && (kind === 'all' || type(e) === kind)
    && !(kind === 'context' && e.kind === 'context_transform' && /^(add (?:user|assistant)|ingest)/.test(e.content)));
  const rows = after_seq ? filtered.slice(0, limit) : filtered.slice(-limit);
  const records = rows.map(e => {
    const m = e.metadata, request = requests.get(m.request_id), call = calls.get(m.call_id);
    let args = {}, output = {};
    try { args = JSON.parse(e.kind === 'tool_call' ? m.arguments : call?.metadata.arguments || '{}'); } catch {}
    if (e.kind === 'tool_result') try { output = JSON.parse(e.content); } catch {}
    const revision = m.applied_revision ?? m.revision ?? m.context_revision ?? output.observed_revision ?? null;
    const before = m.previous_revision ?? (m.applied_revision != null ? m.revision : null);
    return { id: e.id, seq: e.seq, timestamp: e.timestamp, type: type(e), kind: e.kind,
      actor: e.actor, provider: m.provider || request?.metadata.provider || null,
      model: m.decision_model || m.model || request?.metadata.payload?.model || null,
      request_id: m.request_id || (e.kind === 'inference_request' ? e.id : null),
      label: e.kind === 'decision_proposal' ? (m.decision_model?.startsWith('jev') ? 'Jev recommendations' : 'Selector recommendations')
        : ['tool_call', 'inference_request', 'inference_response', 'attention_decision', 'context_transform', 'context_skip', 'context_review', 'document_lifecycle'].includes(e.kind)
        ? e.content.slice(0, 240) : e.kind.replaceAll('_', ' '),
      revision, previous_revision: before, expected_revision: args.expected_revision ?? null,
      outcome: e.kind === 'decision_proposal' ? 'proposed; not applied' : /rejection|failure/.test(e.kind) || output.error ? 'failed'
        : e.kind === 'context_transform' ? 'applied' : e.kind === 'tool_call' || e.kind === 'inference_request' ? 'requested'
        : e.kind === 'context_skip' ? 'skipped' : 'recorded',
      trigger: m.trigger || null, selection_source: m.selection_source || null,
      byte_guard: m.budget ?? m.input_budget ?? null, request_bytes_and_reserve: m.request_units ?? null,
      before_context_text_tokens: e.kind === 'context_transform' ? snapshotTokens(store, conversation, before) : null,
      after_context_text_tokens: e.kind === 'context_transform' ? snapshotTokens(store, conversation, revision) : null,
      token_method: 'o200k_base; context text only; not full provider input',
      usage: m.usage ? { input_tokens: m.usage.input_tokens ?? null, output_tokens: m.usage.output_tokens ?? null,
        cached_input_tokens: m.usage.input_tokens_details?.cached_tokens ?? m.usage.cache_read_input_tokens ?? null } : null,
      source_ids: m.source_event_ids || (output.source_event_id ? [output.source_event_id] : []),
      selected_ids: m.selected_bundle_ids || [], offloaded_ids: m.offload_bundle_ids || [],
      retained_ids: m.retained_bundle_ids || [], removed_ids: m.removed_bundle_ids || [],
      entries: (m.entries || []).slice(0, 12).map(item => ({ bundle_id: item.bundle_id, action: item.action,
        priority: item.priority, protected: item.protected, reason: item.reason, selection_confidence: item.selection_confidence || null })),
      path: args.path || m.path || output.path || null, tool: m.tool || (e.kind === 'tool_call' ? e.content : null),
      error: output.error ? String(output.error).slice(0, 240) : ['decision_rejection', 'context_rejection'].includes(e.kind)
        ? e.content.slice(0, 240) : m.decision_error || (/failure/.test(e.kind) ? 'See the saved failure record in canonical export.' : null),
    };
  });
  return { records, cursor: rows.at(-1)?.seq || after_seq, has_more: after_seq ? filtered.length > rows.length : false,
    scope: 'bounded audit metadata; canonical export retains historical detail' };
}
