import { memoryView, commitMemory } from './memory.js';
import { extractExplicit, extractionPayload, MEMORY_POLICY } from './memory-extractor.js';
import { responseText, redact } from './provider.js';

export function selectMemory(store, conversation, query = '', allowance = 8000, inspectOverflow = false) {
  const view = memoryView(store, conversation);
  const currentObjective = store.events(conversation).findLast(e => e.kind === 'user' && !e.metadata.purpose?.startsWith('manual-'));
  let eligible = view.records.filter(r => !['superseded', 'invalidated', 'suppressed', 'dormant'].includes(r.lifecycle)
    && (!r.scope.objective_id || (currentObjective?.metadata.purpose === 'agent-objective' && r.scope.objective_id === currentObjective.id)));
  let previousLength;
  do {
    previousLength = eligible.length;
    const ids = new Set(eligible.map(r => r.memory_id));
    eligible = eligible.filter(r => r.depends_on.every(ref => ids.has(ref)));
  } while (eligible.length !== previousLength);
  const byId = new Map(eligible.map(r => [r.memory_id, r]));
  const closure = list => {
    const result = new Map(list.map(r => [r.memory_id, r]));
    for (const r of result.values()) for (const ref of [...r.depends_on, ...r.conflicts_with]) {
      const related = byId.get(ref); if (related && !result.has(ref)) result.set(ref, related);
    }
    return [...result.values()];
  };
  const binding = eligible.filter(r => r.binding);
  // Duplicates carry no extra authority; exact same conditions can share one
  // projection entry while the ledger preserves every distinct source.
  const unique = list => list.filter((r, i) => list.findIndex(n => n.content === r.content && n.resolution === r.resolution) === i);
  const selected = closure(unique(binding));
  const terms = new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || []);
  const scores = eligible.filter(r => !r.binding).map(r => ({ record: r, match: [...terms].filter(t => r.content.toLowerCase().includes(t)).length }));
  scores.sort((a, b) => b.match - a.match || b.record.created_at.localeCompare(a.record.created_at));
  const project = r => ({ memory_id: r.memory_id, kind: r.kind, content: r.content, authority: r.authority,
    resolution: r.resolution, binding: r.binding, source_refs: r.source_refs.slice(-1), source_count: r.source_refs.length, conflicts_with: r.conflicts_with, depends_on: r.depends_on,
    scope: r.scope, ...(r.unresolved_source_ids ? { unresolved_source_ids: r.unresolved_source_ids } : {}), confidence: null });
  const bytes = list => Buffer.byteLength(JSON.stringify(list.map(project)), 'utf8');
  const capacityError = bytes(selected) > allowance ? `Binding memory capacity exceeded: ${bytes(selected)} bytes > ${allowance}. Resolve or scope commitments before continuing; none were silently dropped.` : null;
  if (capacityError && !inspectOverflow) throw Error(capacityError);
  for (const { record, match } of scores) {
    if (!match || selected.length >= 20 || selected.some(r => r.content === record.content)) continue;
    const cluster = closure([record]).filter(r => !selected.includes(r));
    if (bytes([...selected, ...cluster]) <= allowance) selected.push(...cluster);
  }
  return { revision: view.revision, records: selected.map(project), memory_ids: selected.map(r => r.memory_id),
    bytes: bytes(selected), allowance, capacity_error: capacityError, scores: scores.slice(0, 20).map(s => ({ memory_id: s.record.memory_id, task_match: s.match })), policy: MEMORY_POLICY };
}

export async function captureMemory(h, event) {
  const started = Date.now();
  if (h.options.mode !== 'layered' || h.options.automaticMemory === false) return;
  h.options.signal?.throwIfAborted();
  await h.store.flush?.(); // Durable source precedes memory work and its failures.
  const events = h.store.events(h.conversation);
  if (events.some(e => e.kind === 'memory_capture' && e.metadata.source_event_id === event.id && e.metadata.status === 'completed')) return;
  let view = memoryView(h.store, h.conversation), status = 'completed', error = null;
  try {
    const proposed = extractExplicit(event);
    // All explicit captures are admitted before optional inference. No paid call
    // is needed for the common constraint/correction path.
    for (const p of proposed) {
      const objective = event.metadata.purpose === 'agent-objective' ? event.id : undefined;
      const peers = view.records.filter(r => r.canonical_key === p.canonical_key && r.scope.objective_id === objective && !['superseded', 'suppressed', 'invalidated'].includes(r.lifecycle));
      if (p.correction && peers.length === 1) p.supersedes = peers[0].memory_id;
      view = commitMemory(h.store, h.conversation, [p], { event, expected_revision: view.revision });
    }
    const ambiguousCorrection = /\b(?:correction|actually|instead|change (?:the|my)|i meant)\b/i.test(event.content)
      && !proposed.some(p => p.supersedes);
    if (ambiguousCorrection && view.records.some(r => r.binding && r.lifecycle === 'retained')) {
      // No similarity-based supersession. Preserve the entire new passage and
      // mark existing commitments contested until a human resolves the target.
      const objective = event.metadata.purpose === 'agent-objective' ? event.id : undefined;
      const targets = view.records.filter(r => r.binding && r.scope.objective_id === objective && r.lifecycle === 'retained');
      if (event.content.length <= 2000) view = commitMemory(h.store, h.conversation, [{ kind: 'claim', span_start: 0, span_end: event.content.length,
        conflicts_with: targets.map(r => r.memory_id) }], { event, expected_revision: view.revision });
      else h.store.append(h.conversation, 'memory_delta', 'Ambiguous correction; recover exact passage before reuse', { expected_revision: view.revision, records: [],
        changes: targets.map(r => ({ memory_id: r.memory_id, resolution: 'contested', unresolved_source_ids: [event.id] })) });
    }
    // Paid extraction is bounded and proposes candidates only. Enable it on the
    // production service; dependency-injected services can supply their own policy.
    if (h.options.memoryModel && !proposed.length && event.content.length <= 4000
      && /\b(?:preference|constraint|budget|requirement|remember|correction|decided|decision)\b/i.test(event.content)) {
      if ((h.memoryCalls || 0) >= 1) throw Error('Memory extraction deferred: the one-call allowance for this turn was used.');
      h.memoryCalls = (h.memoryCalls || 0) + 1;
      const previous = h.lastRequestId;
      try {
        const heads = view.entries.filter(r => ['retained', 'candidate'].includes(r.lifecycle)
          && (!r.scope.objective_id || event.metadata.purpose === 'agent-objective' && r.scope.objective_id === event.id));
        const response = await h.call(extractionPayload(event, heads, h.options.model), 'memory-extraction', { budget: 12000, output: 600, signal: AbortSignal.timeout(15000) });
        const data = JSON.parse(responseText(response));
        if (!data || Object.keys(data).length !== 1 || !Array.isArray(data.records) || data.records.length > 8
          || data.records.some(r => !r || Object.keys(r).sort().join(',') !== 'kind,span_end,span_start' || !['preference', 'claim', 'question'].includes(r.kind))) throw Error('Invalid candidate extraction schema');
        view = commitMemory(h.store, h.conversation, data.records, { event, expected_revision: view.revision, extraction_model: response.model || h.options.model });
      } finally { h.lastRequestId = previous; }
    }
  } catch (e) {
    if (h.options.signal?.aborted || e.agent_status) throw e;
    status = /extraction deferred:/.test(e.message) ? 'deferred' : 'failed'; error = redact(e);
  }
  h.store.append(h.conversation, 'memory_capture', 'Automatic conversation memory', {
    source_event_id: event.id, status, error, revision: memoryView(h.store, h.conversation).revision,
    elapsed_ms: Math.max(0, Date.now() - started),
    policy: MEMORY_POLICY, retry_on_activity: status !== 'completed' });
  await h.store.flush?.();
}

export function activateMemory(h, query) {
  if (h.options.mode !== 'layered' || h.options.automaticMemory === false) return;
  const selection = selectMemory(h.store, h.conversation, query, Math.max(800, Math.min(16000, Math.floor(h.options.budget * 0.2))), h.options.memoryCapacityInspect);
  h.store.append(h.conversation, 'memory_activation', 'Selected conversation memory', selection);
  return selection;
}
