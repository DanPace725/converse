// Selection is deterministic and replaceable; semantic rewriting stays in Harness.
// Scores express retention preference, not confidence in truth or fidelity.
export const ATTENTION_POLICY = 'attention-v1';

export function retentionPlan(segments, { query = '', recent = 4, protectedIds = [], batchBytes, measure,
  budget, force = false, legacy = false }) {
  const recentIds = new Set(segments.slice(-recent).map((s) => s.id));
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [])].slice(0, 12);
  const entries = segments.map((s, order) => {
    const protectedItem = !!(s.pinned || s.verbatim_required || s.state_key || protectedIds.includes(s.id) || recentIds.has(s.id));
    const matches = terms.filter((t) => s.content.toLowerCase().includes(t)).length;
    const important = ['objective', 'constraint', 'decision', 'question'].includes(s.type) || s.status === 'unresolved';
    const priority = protectedItem ? 4 : s.status === 'superseded' ? 0 : important || matches ? 3 : s.type === 'summary' ? 2 : 1;
    return { bundle_id: s.id, priority, protected: protectedItem, order, matches,
      action: 'retain', reason: protectedItem ? 'pin, structured state, verbatim requirement, current request, or recent window'
        : s.status === 'superseded' ? 'superseded; original remains recoverable'
          : important ? 'structured task state or unresolved material' : matches ? 'matches current task' : 'older working material' };
  });
  const requestUnits = measure(segments);
  const candidates = entries.filter((e) => !e.protected && segments[e.order].type !== 'reference');
  if (!legacy) candidates.sort((a, b) => a.priority - b.priority || a.order - b.order);
  const selected = [];
  if (force || requestUnits >= budget * 0.75) {
    for (const entry of candidates) {
      const item = segments[entry.order];
      if (Buffer.byteLength(JSON.stringify([...selected, item]), 'utf8') > batchBytes) {
        if (Buffer.byteLength(item.content) > 1000) { entry.action = 'offload'; entry.reason = 'Older bundle exceeds remaining compaction batch; preserve it through a retrieval pointer.'; }
        continue;
      }
      selected.push(item);
      entry.action = 'compact';
    }
  }
  return { policy_version: ATTENTION_POLICY, strategy: legacy ? 'chronological' : 'priority-and-task',
    counter: 'utf8-bytes-conservative-proxy-v1', request_units: requestUnits, budget,
    trigger_units: Math.floor(budget * 0.75), protected_units: measure(segments.filter((_, i) => entries[i].protected)),
    over_budget: requestUnits > budget, entries, selected_bundle_ids: selected.map((s) => s.id), offload_bundle_ids: entries.filter(e => e.action === 'offload').map(e => e.bundle_id) };
}

export function referenceFor(item, makeSegment) {
  return makeSegment(`Offloaded ${item.type} (${item.status}). Original bundle: ${item.id}. Use resolve_context to expand it.`,
    item.source_event_ids, { type: 'reference', status: item.status, parent_bundle_ids: [item.id], ref_bundle_id: item.id });
}
