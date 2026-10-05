import { hash, id } from './store.js';
import { removedSources } from './documents.js';
import { sourceIdentityIndex } from './identity.js';
import { extractExplicit, canonicalKey, captureText, correctionPeers, budgetSlot, retirementRequested, MEMORY_POLICY, MEMORY_PASSAGE_LIMIT } from './memory-extractor.js';

export const MEMORY_VERSION = 'memory-record-v1';
const conflict = message => Object.assign(Error(message), { status: 409 });
const kinds = ['commitment', 'preference', 'claim', 'question'];

// Event-backed, independent of editable snapshots. Restoring a context cannot
// resurrect an obsolete head. Lifecycle and source eligibility are separate.
export function memoryView(store, conversation) {
  const events = store.events(conversation), records = [], byId = new Map();
  let revision = 0;
  for (const e of events) if (e.kind === 'memory_delta') {
    revision++;
    for (const r of e.metadata.records || []) { const copy = structuredClone(r); records.push(copy); byId.set(copy.memory_id, copy); }
    for (const change of e.metadata.changes || []) {
      const record = byId.get(change.memory_id);
      if (record) Object.assign(record, change);
    }
  }
  const unavailable = removedSources(events), revised = new Set(events.filter(e => e.metadata.revises_event_id).map(e => e.metadata.revises_event_id));
  const latestFiles = new Map(events.filter(e => e.kind === 'document' && e.metadata.workspace_path).map(e => [e.metadata.workspace_path, e.id]));
  const sources = new Map(events.map(e => [e.id, e]));
  const invalid = new Set();
  for (const r of records) if (r.source_refs.some(ref => {
    const source = sources.get(ref.event_id);
    return !source || unavailable.has(ref.event_id) || revised.has(ref.event_id)
      || (source.metadata.workspace_path && latestFiles.get(source.metadata.workspace_path) !== source.id);
  })) invalid.add(r.memory_id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of records) if (!invalid.has(r.memory_id) && r.depends_on.some(ref => invalid.has(ref)
      || ['suppressed', 'superseded', 'invalidated'].includes(byId.get(ref)?.lifecycle))) { invalid.add(r.memory_id); changed = true; }
  }
  const selected = events.findLast(e => e.kind === 'memory_activation')?.metadata.memory_ids || [];
  for (const r of records) {
    if (invalid.has(r.memory_id) && !['suppressed', 'superseded'].includes(r.lifecycle)) r.lifecycle = 'invalidated';
    r.active = selected.includes(r.memory_id) && !['invalidated', 'suppressed', 'superseded'].includes(r.lifecycle);
  }
  const captures = new Map();
  for (const e of events) if (e.kind === 'memory_capture') {
    const previous = captures.get(e.metadata.source_event_id);
    captures.set(e.metadata.source_event_id, { ...e.metadata, attempts: (previous?.attempts || 0) + 1 });
  }
  const excluded = new Set(records.filter(r => ['suppressed', 'superseded', 'invalidated'].includes(r.lifecycle)).flatMap(r => r.source_refs.map(ref => ref.event_id)));
  const issues = [...captures.values()].filter(c => c.status !== 'completed' && !excluded.has(c.source_event_id)
    && !unavailable.has(c.source_event_id) && !revised.has(c.source_event_id)).map(c => ({ ...c,
      ...(c.attempts >= 3 && c.retry_on_activity ? { retry_on_activity: false, retry_disposition: 'attempts-exhausted' } : {}) }));
  return { schema_version: MEMORY_VERSION, revision, scope: { conversation_id: conversation }, records,
    entries: records.filter(r => !['superseded'].includes(r.lifecycle)),
    capture: events.findLast(e => e.kind === 'memory_capture')?.metadata || null,
    capture_summary: { checked_sources: captures.size,
      admitted: [...captures.values()].reduce((n, c) => n + (c.admitted_count || 0), 0),
      completed_empty: [...captures.values()].filter(c => c.status === 'completed' && c.admitted_count === 0).length,
      unknown_counts: [...captures.values()].filter(c => !Number.isSafeInteger(c.admitted_count)).length },
    capture_issues: issues.slice(-20), capture_issue_count: issues.length,
    confidence_note: 'Source reports and user instructions; confidence unknown. Priority is not factual confidence.' };
}

export function commitMemory(store, conversation, proposals, { expected_revision, event, extraction_model = null, selection_sources = new Map(), manual = false } = {}) {
  const view = memoryView(store, conversation);
  if (expected_revision !== view.revision) throw conflict('Stale memory revision; reload memory');
  if (!Array.isArray(proposals) || proposals.length > 8) throw Error('Supply at most 8 memory proposals');
  if (!event || store.event(conversation, event.id).content !== event.content
    || !['user', 'document', 'assistant'].includes(event.kind)) throw Error('Memory capture requires an eligible source in this conversation');
  event = store.event(conversation, event.id); // Actor/kind are canonical, never caller-supplied.
  const sourceEvents = store.events(conversation);
  if (removedSources(sourceEvents).has(event.id) || sourceEvents.some(e => e.metadata.revises_event_id === event.id)
    || (event.metadata.workspace_path && sourceEvents.findLast(e => e.kind === 'document' && e.metadata.workspace_path === event.metadata.workspace_path)?.id !== event.id))
    throw Error('Memory source is removed, revised or no longer the current file version');
  if (event.kind === 'assistant' && !store.events(conversation).some(e => e.kind === 'turn_complete' && e.metadata.assistant_event_id === event.id)) throw Error('Incomplete assistant output is not eligible memory');
  const records = [], changes = [], keys = new Set();
  for (const p of proposals) {
    if (!kinds.includes(p.kind) || !Number.isSafeInteger(p.span_start) || !Number.isSafeInteger(p.span_end)
      || p.span_start < 0 || p.span_end <= p.span_start || p.span_end > event.content.length) throw Error('Invalid memory source span/schema');
    const content = event.content.slice(p.span_start, p.span_end);
    if (!manual && event.kind === 'user' && captureText(event.content).slice(p.span_start, p.span_end) !== content)
      throw Error('Quoted inspection data is not eligible automatic memory');
    const limit = !manual ? MEMORY_PASSAGE_LIMIT : 2000;
    if (!content.trim() || content.length > limit) throw Error(`Memory span must contain 1–${limit} characters`);
    if (p.content !== undefined && p.content !== content) throw Error('Memory wording differs from its source span');
    const binding = p.kind === 'commitment' && event.kind === 'user' && event.actor === 'human' && (manual
      || extractExplicit(event).some(r => r.kind === 'commitment' && r.span_start === p.span_start && r.span_end === p.span_end));
    if (p.kind === 'commitment' && !binding) throw Error('Ambiguous proposal cannot become a binding commitment');
    const key = canonicalKey(content);
    const idempotency = hash([event.id, p.span_start, p.span_end, hash(content), MEMORY_POLICY, key]);
    if (view.records.some(r => r.idempotency_key === idempotency) || keys.has(idempotency)) continue;
    keys.add(idempotency);
    const target = p.supersedes ? view.records.find(r => r.memory_id === p.supersedes) : null;
    if (p.supersedes && (!target || ['superseded', 'invalidated', 'suppressed'].includes(target.lifecycle))) throw conflict('Correction target changed; reload memory');
    const objective = event.metadata.purpose === 'agent-objective' ? event.id : undefined;
    const eligible = view.records.filter(r => r.scope.objective_id === objective && !['invalidated', 'superseded', 'suppressed'].includes(r.lifecycle));
    const recognized = extractExplicit(event).find(r => r.span_start === p.span_start && r.span_end === p.span_end);
    if (target && !manual && (!recognized?.correction || !binding
      || correctionPeers(recognized, eligible).length !== 1 || correctionPeers(recognized, eligible)[0].memory_id !== target.memory_id))
      throw Error('Automatic correction requires a unique matching instruction in the same scope');
    const peers = view.records.filter(r => r.canonical_key === key && r.scope.objective_id === objective && !['invalidated', 'superseded', 'suppressed'].includes(r.lifecycle));
    const duplicate = event.kind === 'user' && event.actor === 'human' && !p.depends_on?.length && !target && !p.correction && peers.find(r => !r.depends_on.length && r.content === content && r.kind === p.kind
      && r.attribution?.actor === event.actor && r.attribution?.kind === event.kind);
    if (duplicate) {
      if (!duplicate.source_refs.some(ref => ref.event_id === event.id && ref.span_start === p.span_start && ref.span_end === p.span_end))
        changes.push({ memory_id: duplicate.memory_id, source_refs: [...duplicate.source_refs, { event_id: event.id, content_hash: hash(event.content),
          span_hash: hash(content), span_start: p.span_start, span_end: p.span_end, source_version: event.id }] });
      continue; // Exact repeats add provenance, never another head or independent support.
    }
    // Even identical paraphrases do not add independent support. Retain distinct
    // source versions; competing quantities stay contested unless explicitly corrected.
    if (p.conflicts_with && (!Array.isArray(p.conflicts_with) || p.conflicts_with.some(ref => !view.records.some(r => r.memory_id === ref)))) throw Error('Invalid memory conflict target');
    const conflicts = !target ? [...new Set([...peers.filter(r => r.content !== content).map(r => r.memory_id), ...(p.conflicts_with || [])])] : [];
    const dependencies = p.depends_on || [];
    if (!Array.isArray(dependencies) || dependencies.length > 8 || dependencies.some(ref => !view.records.some(r => r.memory_id === ref && !['superseded', 'invalidated', 'suppressed'].includes(r.lifecycle)))) throw Error('Invalid memory dependency');
    const r = { memory_id: id('mem'), version: target ? target.version + 1 : 1, canonical_key: key,
      schema_version: MEMORY_VERSION, kind: p.kind, content, scope: target?.scope || { conversation_id: conversation,
        ...(event.metadata.purpose === 'agent-objective' ? { objective_id: event.id } : {}) },
      source_refs: [{ event_id: event.id, content_hash: hash(event.content), span_hash: hash(content),
        span_start: p.span_start, span_end: p.span_end, source_version: event.id }],
      attribution: sourceIdentityIndex(store.events(conversation)).get(event.id),
      authority: binding ? 'user_committed' : event.kind === 'user' && event.actor === 'human' ? 'user_reported' : event.kind === 'assistant' ? 'model_proposed' : 'externally_reported', resolution: conflicts.length ? 'contested' : binding ? 'reported' : 'unresolved',
      confidence: null, limitations: ['Source span validated; semantic entailment and external facts are not independently verified.'],
      lifecycle: binding ? 'retained' : 'candidate', binding, conflicts_with: conflicts, supersedes: target ? [target.memory_id] : [],
      depends_on: dependencies, origin_groups: [event.id], created_at: event.timestamp,
      ...(target?.target_slot || budgetSlot(content) ? { target_slot: target?.target_slot || budgetSlot(target?.content || content) } : {}),
      extraction_model: selection_sources.get(p.span_start)?.model || extraction_model,
      ...(selection_sources.has(p.span_start) ? { selection_source: selection_sources.get(p.span_start) } : {}), controller_policy_version: MEMORY_POLICY, idempotency_key: idempotency };
    if (target) changes.push({ memory_id: target.memory_id, lifecycle: 'superseded', active: false });
    for (const ref of conflicts) changes.push({ memory_id: ref, resolution: 'contested', conflicts_with: [...new Set([...(view.records.find(r => r.memory_id === ref)?.conflicts_with || []), r.memory_id])] });
    records.push(r);
  }
  if (records.length || changes.length) store.append(conversation, 'memory_delta', 'Capture conversation memory', {
    schema_version: MEMORY_VERSION, expected_revision, records, changes, policy: MEMORY_POLICY });
  return memoryView(store, conversation);
}

export function changeMemory(store, conversation, memoryId, operation, expectedRevision) {
  const view = memoryView(store, conversation);
  if (expectedRevision !== view.revision) throw conflict('Stale memory revision; reload memory');
  const r = view.records.find(r => r.memory_id === memoryId);
  if (!r || !['suppress', 'restore'].includes(operation)) throw Error('Invalid memory operation');
  if (operation === 'restore' && r.lifecycle !== 'suppressed') throw conflict('Only a suppressed current record can be restored');
  if (operation === 'restore' && view.records.some(n => n.supersedes.includes(r.memory_id))) throw conflict('A superseded record cannot be restored');
  store.append(conversation, 'memory_delta', operation === 'suppress' ? 'Do not use memory' : 'Restore memory eligibility', {
    expected_revision: expectedRevision, records: [], changes: [{ memory_id: memoryId, lifecycle: operation === 'suppress' ? 'suppressed' : r.binding ? 'retained' : 'candidate', active: false }] });
  return memoryView(store, conversation);
}

// Suppression also excludes original passages and context copies from model
// lookup; human inspection and canonical export still retain the audit trail.
export function suppressedMemorySources(store, conversation) {
  const excluded = new Set(memoryView(store, conversation).records.filter(r => ['suppressed', 'invalidated', 'superseded'].includes(r.lifecycle)).flatMap(r => r.source_refs.map(ref => ref.event_id)));
  const events = store.events(conversation);
  for (const e of events.filter(e => e.kind === 'memory_suppression')) for (const t of e.metadata.targets || [])
    if (t.kind === 'named' && !events.some(n => n.seq > e.seq && n.kind === 'user' && n.actor === 'human'
      && n.metadata.purpose === 'manual-state' && n.metadata.state_key === t.id))
      for (const id of t.source_event_ids || []) excluded.add(id);
  const suppression = events.findLast(e => e.kind === 'memory_suppression' || e.kind === 'memory_delta'
    && e.metadata.changes?.some(c => c.lifecycle === 'suppressed'));
  if (suppression) for (const e of events)
    if (e.seq < suppression.seq && e.kind === 'tool_result'
      && ['read_memory', 'resolve_context', 'retrieve_event', 'retrieve_range', 'search_history', 'search_source', 'workspace_read'].includes(e.metadata.tool)) excluded.add(e.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of events) {
      const dependent = excluded.has(e.metadata.user_event_id) || excluded.has(e.metadata.revises_event_id)
        || e.metadata.source_event_ids?.some(ref => excluded.has(ref));
      const targets = e.kind === 'turn_complete' && dependent ? [e.metadata.assistant_event_id] : dependent && ['reasoning', 'assistant', 'tool_result'].includes(e.kind) ? [e.id] : [];
      for (const target of targets) if (target && !excluded.has(target)) { excluded.add(target); changed = true; }
    }
  }
  return excluded;
}

export function gateStateAuthority(store, conversation, current, updates) {
  const binding = memoryView(store, conversation).records.filter(r => r.binding && r.lifecycle === 'retained');
  return updates.map(u => {
    const sources = (u.source_event_ids || []).map(ref => store.source(conversation, ref));
    const human = sources.filter(e => e.kind === 'user' && e.actor === 'human');
    const exact = human.some(e => e.content.includes(u.content) && !suppressedMemorySources(store, conversation).has(e.id));
    const explicit = exact && human.some(e => e.content.includes(u.content) && (e.metadata.purpose?.startsWith('manual-')
      || extractExplicit(e).some(r => r.kind === 'commitment' && r.content === u.content)));
    const old = current.segments.find(s => s.state_key === u.key);
    if (u.status === 'superseded') {
      const latest = store.events(conversation).findLast(e => e.kind === 'user' && !e.metadata.purpose?.startsWith('manual-'));
      const ownTargets = (u.supersedes || []).every(ref => ref === old?.id || ref === old?.state_key || ref === 'state:' + old?.state_key
        || store.resolveBundle(conversation, ref).id === old?.id);
      if (!old || u.type !== old.type || u.content !== old.content || !ownTargets
        || !human.some(e => e.id === latest?.id && retirementRequested(e, old)))
        throw Error('Retirement requires the current human request and unchanged content of its targeted named entry');
      return u; // Lifecycle retirement grants no new authority.
    }
    const targets = [old, ...(u.supersedes || []).map(ref => {
      const named = current.segments.find(s => s.id === ref || s.state_key === ref.replace(/^state:/, ''));
      return named || current.segments.find(s => s.id === store.resolveBundle(conversation, ref).id);
    })].filter(Boolean);
    if (targets.some(s => ['constraint', 'decision'].includes(s.type) && s.status === 'active' && s.attribution?.some(a => a.kind === 'user' && a.actor === 'human')
      && !(explicit && human.some(e => !s.source_event_ids.includes(e.id)
        && (e.metadata.purpose?.startsWith('manual-') || e.metadata.revises_event_id && s.source_event_ids.includes(e.metadata.revises_event_id)
          || extractExplicit(e).some(p => p.correction && p.content === u.content
            && correctionPeers(p, [{ content: s.content, canonical_key: canonicalKey(s.content) }]).length === 1))))) )
      throw Error('A model interpretation cannot replace a binding user constraint; cite its exact correction or use a human edit');
    if (binding.some(r => r.source_refs.some(ref => sources.some(e => e.id === ref.event_id))) && u.type === 'constraint' && !exact)
      throw Error('Keep binding user constraints in their exact source wording');
    return !explicit && ['constraint', 'decision'].includes(u.type)
      ? { ...u, status: 'unresolved', limitations: [...new Set([...(u.limitations || []), 'Model-proposed interpretation; user acceptance is not established.'])].slice(0, 16) } : u;
  });
}
