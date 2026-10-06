import { memoryView, commitMemory, suppressedMemorySources } from './memory.js';
import { extractExplicit, captureText, correctionPeers, budgetSlot, MEMORY_POLICY, memoryDirective, memoryPassages, memoryPassageCoverage, routineMemoryInstruction, routineMemoryRequest } from './memory-extractor.js';
import { memoryTopic, sameMemoryScope } from './memory-scope.js';
import { redact } from './provider.js';
import { embeddingKey } from './embeddings.js';
import { compareSelections } from './memory-evaluation.js';
import { extractPassages, hybridPassages, jevPassages } from './memory-selection.js';
import { relevance, memoryQuery, substantiveDiscussion, engagementPriority } from './memory-relevance.js';

// Optional task-model second opinion after Jev's candidates are committed.
// It records disagreement; it cannot add, remove or correct a memory.
async function compareTaskMemory(h, event, passages, heads, jev) {
  if (!h.options.memoryComparison || !passages.length) return;
  const previous = h.lastRequestId, started = Date.now();
  let llm = null, error = null;
  try {
    llm = await extractPassages(h, event, heads, passages, { purpose: 'memory-comparison' });
  } catch (e) {
    if (h.options.signal?.aborted || e.agent_status) throw e;
    error = redact(e);
  } finally { h.lastRequestId = previous; }
  h.store.append(h.conversation, 'memory_comparison', 'Task-model comparison of active Jev memory', {
    source_event_id: event.id, source_kind: event.kind, active_selector: 'jev', applied: false,
    jev, llm, error, elapsed_ms: Date.now() - started,
    comparison: llm ? compareSelections(jev.records, llm.records) : null });
}

// Shadow comparison only: Jev's choices are recorded beside the task model's and
// never committed. Failures are recorded and never block capture.
async function shadowMemory(h, event, passages, heads, llm) {
  if (!h.decisionAdapter?.selectMemory || h.options.memoryShadow === false || !passages.length) return;
  const previous = h.lastRequestId, started = Date.now();
  let jev = null, error = null;
  try {
    jev = await h.decisionAdapter.selectMemory(passages, { source_kind: event.kind, related: heads.slice(0, 4) }, h.call.bind(h));
  } catch (e) {
    if (h.options.signal?.aborted || e.agent_status) throw e;
    error = redact(e);
  } finally { h.lastRequestId = previous; }
  h.store.append(h.conversation, 'memory_shadow', 'Jev memory selection shadow', {
    source_event_id: event.id, source_kind: event.kind, policy: MEMORY_POLICY, passage_count: passages.length,
    passages: passages.map(p => ({ passage_id: p.passage_id, span_start: p.span_start, span_end: p.span_end })),
    llm, jev: jev && { ...jev, elapsed_ms: Date.now() - started }, error, applied: false,
    comparison: llm.records && jev ? compareSelections(llm.records, jev.records) : null });
}

export function selectMemory(store, conversation, query = '', allowance = 8000, inspectOverflow = false, semanticScores = new Map()) {
  const view = memoryView(store, conversation);
  const events = store.events(conversation);
  query = memoryQuery(events, query);
  const currentObjective = events.findLast(e => e.kind === 'user' && !e.metadata.purpose?.startsWith('manual-'));
  const topic = currentObjective ? memoryTopic(events, currentObjective) : {};
  let eligible = view.records.filter(r => !['superseded', 'invalidated', 'suppressed', 'dormant'].includes(r.lifecycle)
    && !routineMemoryInstruction(r.content) && !r.scope.topic_ambiguous
    && (!r.scope.topic_id || r.scope.topic_id === topic.topic_id)
    && (!topic.topic_id || r.scope.topic_id || r.binding)
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
  const scores = eligible.filter(r => !r.binding).map(r => ({ record: r,
    ...relevance(r.content, query, semanticScores.get(r.memory_id) || 0),
    engagement: engagementPriority(events, r.memory_id, Date.parse(currentObjective?.timestamp || r.created_at)) }));
  scores.sort((a, b) => (b.relevance + b.engagement) - (a.relevance + a.engagement) || b.record.created_at.localeCompare(a.record.created_at));
  const project = r => ({ memory_id: r.memory_id, kind: r.kind, content: r.content, authority: r.authority,
    resolution: r.resolution, binding: r.binding, source_refs: r.source_refs.slice(-1), source_count: r.source_refs.length, conflicts_with: r.conflicts_with, depends_on: r.depends_on,
    scope: r.scope, ...(r.unresolved_source_ids ? { unresolved_source_ids: r.unresolved_source_ids } : {}), confidence: null });
  const bytes = list => Buffer.byteLength(JSON.stringify(list.map(project)), 'utf8');
  const capacityError = bytes(selected) > allowance ? `Binding memory capacity exceeded: ${bytes(selected)} bytes > ${allowance}. Resolve or scope commitments before continuing; none were silently dropped.` : null;
  if (capacityError && !inspectOverflow) throw Error(capacityError);
  const stubs = [];
  for (const { record, tier } of scores) {
    if (tier === 'archive' || selected.length >= 20 || selected.some(r => r.content === record.content)) continue;
    const cluster = closure([record]).filter(r => !selected.includes(r));
    if (tier === 'full' && bytes([...selected, ...cluster]) <= allowance) selected.push(...cluster);
    else if (stubs.length < 4) {
      const stub = { memory_id: record.memory_id, tier: 'stub', kind: record.kind, excerpt: record.content.slice(0, 96),
        authority: record.authority, resolution: record.resolution, source_event_id: record.source_refs.at(-1).event_id,
        retrieval: 'read_memory; retrieve exact dependencies before use' };
      if (Buffer.byteLength(JSON.stringify([...stubs, stub])) <= Math.min(1200, Math.floor(allowance * .15))) stubs.push(stub);
    }
  }
  const pointers = stubs.filter(s => !selected.some(r => r.memory_id === s.memory_id));
  return { revision: view.revision, records: selected.map(project), memory_ids: selected.map(r => r.memory_id),
    stubs: pointers, archived_count: eligible.filter(r => !selected.includes(r) && !pointers.some(s => s.memory_id === r.memory_id)).length,
    bytes: bytes(selected), stub_bytes: Buffer.byteLength(JSON.stringify(pointers)), allowance, capacity_error: capacityError,
    scores: scores.slice(0, 20).map(s => ({ memory_id: s.record.memory_id, task_match: s.match, matched_terms: s.matched_terms,
      semantic_similarity: s.semantic, engagement_priority: s.engagement, tier: selected.includes(s.record) ? 'full' : pointers.some(p => p.memory_id === s.record.memory_id) ? 'stub' : 'archive' })),
    semantic_query_hash: embeddingKey(query), policy: MEMORY_POLICY };
}

export function memorySemanticScores(h, query) {
  query = memoryQuery(h.store.events(h.conversation), query);
  if (h.semanticMemoryScores) return h.semanticMemoryScores;
  const row = h.store.db.prepare("SELECT metadata FROM events WHERE conversation_id=? AND kind='memory_activation' ORDER BY seq DESC LIMIT 1").get(h.conversation);
  const latest = row ? JSON.parse(row.metadata) : null;
  return latest?.semantic_query_hash === embeddingKey(String(query).slice(0, 1024))
    ? new Map([...(latest.scores || []).map(s => [s.memory_id, s.semantic_similarity || 0]), ...(latest.named_scores || []).map(s => [s.id, s.semantic_similarity])]) : new Map();
}

export async function prepareSemanticMemory(h, query) {
  if (!h.options.semanticRetrieval || h.options.mode !== 'layered' || h.options.automaticMemory === false) return;
  const matches = await h.options.semanticRetrieval.matches(h, memoryQuery(h.store.events(h.conversation), query), 'memory');
  h.semanticMemoryScores = new Map(matches.map(r => [r.entity_id, r.similarity]));
}

export async function captureMemory(h, event) {
  const started = Date.now();
  if (h.options.mode !== 'layered' || h.options.automaticMemory === false) return;
  h.options.signal?.throwIfAborted();
  await h.store.flush?.(); // Durable source precedes memory work and its failures.
  const events = h.store.events(h.conversation);
  if (event.kind === 'assistant' && (!events.some(e => e.kind === 'turn_complete' && e.metadata.assistant_event_id === event.id)
    || suppressedMemorySources(h.store, h.conversation).has(event.id))) return;
  if (events.some(e => e.kind === 'memory_capture' && e.metadata.source_event_id === event.id && e.metadata.status === 'completed')) return;
  // Capture the previous completed research episode on the next human turn.
  // This keeps partial output out of memory and avoids delaying a final answer.
  if (event.kind === 'user') {
    const completed = events.findLast(e => e.kind === 'turn_complete' && e.seq < event.seq);
    const source = completed && events.find(e => e.id === completed.metadata.assistant_event_id);
    const reads = completed && events.filter(e => e.kind === 'tool_result' && e.seq < completed.seq
      && e.seq > (events.find(e => e.id === completed.metadata.user_event_id)?.seq || completed.seq)
      && ['web_fetch', 'retrieve_event', 'workspace_read'].includes(e.metadata.tool));
    const humanDiscussion = substantiveDiscussion(captureText(event.content)) && !routineMemoryRequest(event.content);
    const explicit = extractExplicit(event).length > 0;
    const reason = memoryDirective(event.content) ? 'explicit memory request' : reads?.length >= 3 ? 'completed research'
      : !humanDiscussion && !explicit && substantiveDiscussion(source?.content || '', 'assistant')
        && /\S/.test(captureText(event.content)) && !/^(?:yeah|yes|ok(?:ay)?|thanks?|thank you|great|good|nice|got it)[\s,!\.]*(?:that would be good|please|thanks?|thank you)?[\s,!\.]*$/i.test(event.content.trim()) ? 'completed substantive discussion' : null;
    h.store.append(h.conversation, 'memory_capture_gate', 'Local capture eligibility', {
      source_event_id: source?.id || event.id, user_event_id: event.id,
      reason: humanDiscussion && !explicit ? 'current substantive human discussion has priority' : reason || 'routine turn or no substantive completed source',
      eligible: !!reason || humanDiscussion, execution: 'local', policy: MEMORY_POLICY });
    if (source && reason && (!humanDiscussion || memoryDirective(event.content) || explicit)) await captureMemory(h, source);
  }
  let view = memoryView(h.store, h.conversation), status = 'completed', error = null, retryable = true;
  const initialRevision = view.revision, initialIds = new Set(view.records.map(r => r.memory_id));
  const selectionStartSeq = h.store.events(h.conversation).at(-1)?.seq || 0;
  const selector = h.options.memorySelector || 'task-model';
  let captureReason = 'no eligible commitment or research candidate', paid = false, invalidSelections = 0, passageCoverage = null, deferredPassages = [];
  try {
    const proposed = extractExplicit(event);
    if (proposed.length) captureReason = 'exact human commitment or correction';
    // All explicit captures are admitted before optional inference. No paid call
    // is needed for the common constraint/correction path.
    for (const p of proposed) {
      const scope = { ...memoryTopic(events, event), objective_id: event.metadata.purpose === 'agent-objective' ? event.id : undefined };
      const eligible = view.records.filter(r => sameMemoryScope(r, scope) && !['superseded', 'suppressed', 'invalidated'].includes(r.lifecycle));
      const peers = correctionPeers(p, eligible);
      if (p.correction && p.binding && peers.length === 1) p.supersedes = peers[0].memory_id;
      else if (p.correction && peers.length) { p.conflicts_with = peers.map(r => r.memory_id); p.kind = 'claim'; }
      // An unbound pronoun range cannot silently become a new operative budget.
      if (budgetSlot(p.content)?.subject === 'it' && budgetSlot(p.content)?.currency === 'unspecified' && !p.supersedes) p.kind = 'claim';
      view = commitMemory(h.store, h.conversation, [p], { event, expected_revision: view.revision });
    }
    // Paid extraction is bounded and proposes candidates only. Enable it on the
    // production service; dependency-injected services can supply their own policy.
    if (h.options.memoryModel && !proposed.length && (event.kind === 'assistant' || !memoryDirective(event.content) && !routineMemoryRequest(event.content)
      && (/\b(?:preference|constraint|budget|requirement|remember|correction|decided|decision)\b/i.test(captureText(event.content)) || substantiveDiscussion(captureText(event.content))))) {
      captureReason = event.kind === 'assistant' ? 'completed discussion/research; unresolved model proposals' : 'bounded human discussion/candidate extraction';
      const previous = h.lastRequestId, passages = memoryPassages(event);
      passageCoverage = memoryPassageCoverage(event, passages);
      if (passages.length && (h.memoryCalls || 0) >= 1) throw Error('Memory extraction deferred: the one-source selection allowance for this turn was used.');
      if (passages.length) h.memoryCalls = (h.memoryCalls || 0) + 1;
      paid = passages.length > 0;
      const scope = { ...memoryTopic(events, event), objective_id: event.metadata.purpose === 'agent-objective' ? event.id : undefined };
      const heads = view.entries.filter(r => ['retained', 'candidate'].includes(r.lifecycle)
        && sameMemoryScope(r, scope));
      const llm = { records: null, error: null, elapsed_ms: null, request_id: null, model: h.options.model };
      const llmStarted = Date.now();
      let halted = false;
      try {
        const hybrid = selector === 'jev-hybrid' && h.decisionAdapter?.selectMemory;
        const jevActive = selector === 'jev' || hybrid;
        const parsed = await (selector === 'jev' ? jevPassages : hybrid ? hybridPassages : extractPassages)(h, event, heads, passages);
        llm.request_id = parsed.calls.at(-1)?.request_id || null; llm.calls = parsed.calls;
        llm.model = parsed.calls.at(-1)?.model || (jevActive ? parsed.jev?.calls.at(-1)?.model : null) || h.options.model;
        llm.elapsed_ms = Date.now() - llmStarted;
        llm.records = parsed.records; invalidSelections = parsed.invalid;
        deferredPassages = parsed.deferred_passage_ids || [];
        if (jevActive) h.store.append(h.conversation, 'memory_selection', 'Passage-level Jev selection', {
          source_event_id: event.id, source_kind: event.kind, selector, jev: parsed.jev, error: parsed.error,
          deferred_passage_ids: deferredPassages,
          fallback_passage_ids: parsed.fallback_passage_ids, calls: parsed.calls, records: parsed.records, applied: false });
        const byId = new Map(passages.map(p => [p.passage_id, p]));
        const spans = parsed.records.map(r => ({ kind: r.kind, span_start: byId.get(r.passage_id).span_start, span_end: byId.get(r.passage_id).span_end }));
        const pending = new Set(parsed.fallback_passage_ids || []);
        const selectionSources = new Map(parsed.records.map(r => {
          const decision = parsed.jev?.decisions.find(d => d.passage_id === r.passage_id);
          const call = parsed.calls.find(c => c.passage_ids.includes(r.passage_id));
          return [byId.get(r.passage_id).span_start, jevActive && !pending.has(r.passage_id)
            ? { selector: 'jev', provider: 'typesafe', model: decision.model, confidence_target: 'keep-or-skip', keep_probability: decision.keep_probability, kind_uncertain: decision.kind_uncertain }
            : { selector: 'task-model', provider: h.provider.name, model: call?.model || h.options.model, request_id: call?.request_id || null }];
        }));
        view = commitMemory(h.store, h.conversation, spans, { event, expected_revision: view.revision, extraction_model: llm.model, selection_sources: selectionSources });
        if (jevActive) h.store.append(h.conversation, 'memory_selection_applied', 'Commit Jev-selected memory candidates', { source_event_id: event.id, selector, revision: view.revision, records: parsed.records });
        if (selector === 'jev' && parsed.jev) await compareTaskMemory(h, event, passages, heads, parsed.jev);
      } catch (e) {
        llm.error = redact(e); llm.elapsed_ms ??= Date.now() - llmStarted; halted = !!e.agent_status;
        if (selector === 'jev' && !h.options.signal?.aborted && !halted) h.store.append(h.conversation, 'memory_selection', 'Jev memory selection failed', {
          source_event_id: event.id, source_kind: event.kind, selector, error: llm.error, applied: false });
        throw e;
      } finally {
        h.lastRequestId = previous;
        if (selector === 'task-model' && !h.options.signal?.aborted && !halted) await shadowMemory(h, event, passages, heads, llm);
      }
    }
  } catch (e) {
    if (h.options.signal?.aborted || e.agent_status) throw e;
    status = /extraction deferred:/.test(e.message) ? 'deferred' : 'failed'; error = redact(e);
    retryable = !/\b(?:OpenAI|Anthropic|TypeSafe) (?:400|401|403|404|422)\b|unsupported (?:value|model|reasoning)|api key.*(?:not found|invalid)|Jev memory selection unavailable/i.test(error);
  }
  const selectionRequests = h.store.events(h.conversation).filter(e => e.seq > selectionStartSeq && e.kind === 'inference_request'
    && ['memory-selection', 'memory-extraction'].includes(e.content));
  paid = selectionRequests.length > 0;
  h.store.append(h.conversation, 'memory_capture', 'Automatic conversation memory', {
    source_event_id: event.id, status, error, revision: memoryView(h.store, h.conversation).revision,
    source_kind: event.kind, reason: captureReason, paid_extraction: paid,
    selector, selection_calls: selectionRequests.length, deferred_passage_ids: deferredPassages,
    invalid_selection_count: invalidSelections, passage_coverage: passageCoverage,
    admitted_count: memoryView(h.store, h.conversation).records.filter(r => !initialIds.has(r.memory_id)).length,
    revision_changed: memoryView(h.store, h.conversation).revision !== initialRevision,
    elapsed_ms: Math.max(0, Date.now() - started),
    policy: MEMORY_POLICY, retry_on_activity: status !== 'completed' && retryable,
    retry_disposition: status === 'completed' ? 'none' : retryable ? 'on-activity' : 'configuration-change-required' });
  await h.store.flush?.();
}

export function activateMemory(h, query) {
  if (h.options.mode !== 'layered' || h.options.automaticMemory === false) return;
  const selection = selectMemory(h.store, h.conversation, query, Math.max(800, Math.min(16000, Math.floor(h.options.budget * 0.2))), h.options.memoryCapacityInspect, memorySemanticScores(h, query));
  const events = h.store.events(h.conversation), user = events.findLast(e => e.kind === 'user' && !e.metadata.purpose?.startsWith('manual-'));
  const query_hash = embeddingKey(memoryQuery(events, query));
  const targets = selection.scores.filter(s => s.matched_terms.length >= 2 || s.semantic_similarity >= .45).map(s => s.memory_id);
  if (user && substantiveDiscussion(captureText(user.content)) && targets.length && !events.some(e => e.kind === 'memory_engagement' && e.metadata.query_hash === query_hash))
    h.store.append(h.conversation, 'memory_engagement', 'Inferred substantive human return; retrieval priority only', {
      source_event_id: user.id, query_hash, target_ids: targets, interpretation: true, authority_changed: false, policy: MEMORY_POLICY });
  selection.named_scores = h.store.context(h.conversation).segments.filter(s => s.state_key && (h.semanticMemoryScores?.get(s.id) || 0) > 0)
    .slice(0, 20).map(s => ({ id: s.id, semantic_similarity: h.semanticMemoryScores.get(s.id) }));
  h.store.append(h.conversation, 'memory_activation', 'Selected conversation memory', selection);
  return selection;
}
