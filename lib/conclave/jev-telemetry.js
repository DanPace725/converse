// Read-only, bounded telemetry. Loading Workspace never invokes a delegate.
export function jevTelemetry(events, { enabled = false, available = false, before_seq = 0, limit = 12 } = {}) {
  if (!Number.isSafeInteger(before_seq) || before_seq < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 30) throw Error('Invalid Jev audit page');
  const requests = events.filter(e => e.kind === 'inference_request' && ['typesafe', 'jev'].includes(e.metadata.provider));
  const requestIds = new Set(requests.map(e => e.id));
  const responses = new Map(events.filter(e => e.kind === 'inference_response' && requestIds.has(e.metadata.request_id)).map(e => [e.metadata.request_id, e]));
  const isJevPlan = m => m.decision_version?.startsWith('jev-') || m.decision_model?.startsWith('jev');
  const decisions = events.filter(e => ['retrieval_decision', 'ingress_decision', 'decision_rejection'].includes(e.kind)
    || ['decision_proposal', 'attention_decision'].includes(e.kind) && isJevPlan(e.metadata));
  const rows = [...requests, ...decisions].filter(e => !before_seq || e.seq < before_seq).sort((a, b) => b.seq - a.seq);
  const records = rows.slice(0, limit).map(e => {
    const m = e.metadata;
    if (e.kind === 'inference_request') {
      const response = responses.get(e.id), r = response?.metadata;
      return { event_id: e.id, seq: e.seq, timestamp: e.timestamp, kind: 'call', purpose: e.content,
        provider: m.provider, model: r?.model || m.payload?.model || null, request_id: e.id,
        outcome: r?.status || 'no response recorded', error: r?.error || null, usage: r?.usage || null,
        elapsed_ms: r?.elapsed_ms ?? null, answers: r?.answers || null, supplied_candidates: Object.values(m.payload?.questions || {}).slice(0, 12)
          .map(q => q.instructions?.candidate).filter(Boolean) };
    }
    return { event_id: e.id, seq: e.seq, timestamp: e.timestamp, kind: e.kind, purpose: m.purpose || e.kind.replace('_decision', ''),
      query: m.query || null, outcome: m.outcome || (m.applied_revision != null ? 'applied at revision ' + m.applied_revision
        : e.kind === 'attention_decision' ? 'selected; transformation recorded separately' : e.kind === 'decision_proposal' ? 'proposed; application recorded separately'
        : e.kind === 'decision_rejection' ? 'rejected' : m.assessment?.fallback ? 'fallback; baseline retained'
        : m.selection_source === 'bounded-model' ? 'model selection recorded' : 'baseline retained'),
      reason: m.reason || null, error: m.error || (e.kind === 'decision_rejection' ? e.content.slice(0, 500) : null),
      selection_source: m.selection_source || null, cache_hit: !!m.cache_hit, request_id: m.request_id || null,
      baseline: m.baseline_event_ids || [], selected: m.selected_event_ids || [],
      candidates: (m.candidates || []).slice(0, 12), assessment: m.assessment || m.classification || null,
      entries: (m.entries || []).slice(0, 12), economics: m.economics || null,
      revision: m.revision ?? null, applied_revision: m.applied_revision ?? null,
      economics_basis: m.economics_basis || 'estimate; no measured savings' };
  });
  const completeUsage = r => Number.isSafeInteger(r?.usage?.input_tokens) && Number.isSafeInteger(r?.usage?.output_tokens);
  const reported = [...responses.values()].map(e => e.metadata);
  const retrieval = decisions.filter(e => e.kind === 'retrieval_decision');
  const changed = e => e.metadata.outcome === 'selection changed' || e.metadata.selection_source === 'bounded-model'
    && e.metadata.baseline_event_ids?.some((id, i) => id !== e.metadata.selected_event_ids?.[i]);
  return { enabled, available, revision: events.at(-1)?.seq || 0,
    summary: { attempts: requests.length, completed: reported.filter(r => r.status === 'completed').length,
      failed: reported.filter(r => r.status && r.status !== 'completed').length, missing_responses: requests.length - responses.size,
      known_input_tokens: reported.reduce((n, r) => n + (r.usage?.input_tokens || 0), 0),
      known_output_tokens: reported.reduce((n, r) => n + (r.usage?.output_tokens || 0), 0),
      unknown_usage_calls: requests.filter(e => !completeUsage(responses.get(e.id)?.metadata)).length,
      known_elapsed_ms: reported.reduce((n, r) => n + (r.elapsed_ms || 0), 0),
      unknown_latency_calls: requests.filter(e => !Number.isFinite(responses.get(e.id)?.metadata.elapsed_ms)).length,
      retrieval_decisions: retrieval.length, changed_selections: retrieval.filter(changed).length,
      confirmed_baselines: retrieval.filter(e => e.metadata.outcome === 'baseline confirmed').length,
      fallbacks: retrieval.filter(e => e.metadata.assessment?.fallback).length,
      cache_hits: decisions.filter(e => e.metadata.cache_hit).length,
      skipped: retrieval.filter(e => e.metadata.outcome === 'skipped').length },
    records, before_cursor: records.at(-1)?.seq || before_seq, has_more: rows.length > records.length,
    scope: 'conversation; provider-reported usage; selection changes are not proof of answer quality or savings' };
}
