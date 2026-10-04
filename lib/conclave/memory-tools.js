import { memoryView, suppressedMemorySources } from './memory.js';
import { stateView } from './state.js';
import { retirementRequested } from './memory-extractor.js';

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const revisions = (h, args, memory, state) => {
  if (args.expected_memory_revision !== memory.revision || args.expected_state_revision !== state.revision)
    fail('Memory/state revision changed; read_memory again from offset 0', 409);
};

// Inspection spans both stores without returning suppressed text to inference.
export function readMemory(h, args) {
  const memory = memoryView(h.store, h.conversation), state = stateView(h.store, h.conversation);
  if (!Number.isSafeInteger(args.offset) || args.offset < 0) fail('Invalid memory offset');
  if (args.offset || args.expected_memory_revision != null || args.expected_state_revision != null) revisions(h, args, memory, state);
  const excluded = suppressedMemorySources(h.store, h.conversation);
  const automatic = memory.records.map(r => ['suppressed', 'superseded', 'invalidated'].includes(r.lifecycle)
    ? { entry_kind: 'automatic', id: r.memory_id, version: r.version, lifecycle: r.lifecycle, active: false,
      supersedes: r.supersedes, content_omitted: true } : { ...r, entry_kind: 'automatic', id: r.memory_id });
  const named = state.entries.map(s => s.status === 'superseded' || s.source_event_ids.some(id => excluded.has(id))
    ? { entry_kind: 'named', id: s.state_key, bundle_id: s.id, status: s.status, content_omitted: true }
    : { ...s, entry_kind: 'named', id: s.state_key, bundle_id: s.id });
  const content = JSON.stringify({ scope: memory.scope, memory_revision: memory.revision, state_revision: state.revision,
    automatic, named, capture_issues: memory.capture_issues,
    note: 'User commitments are instructions, not verified facts. Omitted entries retain history for human inspection; suppression is reversible, not erasure.' }, null, 2);
  if (args.offset > content.length) fail('Memory offset beyond snapshot');
  const page = content.slice(args.offset, args.offset + 8000);
  return { format: 'json', content: page, offset: args.offset, total_characters: content.length,
    memory_revision: memory.revision, state_revision: state.revision,
    automatic_count: automatic.length, named_count: named.length,
    next_offset: args.offset + page.length < content.length ? args.offset + page.length : null };
}

export function suppressMemory(h, args) {
  const memory = memoryView(h.store, h.conversation), state = h.store.context(h.conversation);
  revisions(h, args, memory, state);
  if (!Array.isArray(args.targets) || !args.targets.length || args.targets.length > 8) fail('Supply 1–8 memory targets');
  const user = h.store.source(h.conversation, args.source_event_id);
  const latest = h.store.events(h.conversation).findLast(e => e.kind === 'user' && !e.metadata.purpose?.startsWith('manual-'));
  if (user.id !== latest?.id || user.kind !== 'user' || user.actor !== 'human') fail('Suppression requires the current human request');
  const seen = new Set();
  const targets = args.targets.map(t => {
    if (!t || !['automatic', 'named'].includes(t.kind) || typeof t.id !== 'string' || seen.has(t.kind + ':' + t.id)) fail('Invalid or duplicate memory target');
    seen.add(t.kind + ':' + t.id);
    const r = t.kind === 'automatic' ? memory.records.find(r => r.memory_id === t.id) : state.segments.find(s => s.state_key === t.id);
    if (!r || (t.kind === 'automatic' ? !['retained', 'candidate'].includes(r.lifecycle) : r.status === 'superseded')) fail('Memory target changed or is unavailable; reload', 409);
    if (r.pinned || r.verbatim_required) fail('Pinned or verbatim named state must be changed by the human editor');
    if (!retirementRequested(user, { state_key: t.id, content: r.content })) fail('Current human request does not authorize suppression of every targeted entry');
    return { ...t, record: r };
  });
  const receipt = h.store.atomic(() => {
    const automatic = targets.filter(t => t.kind === 'automatic');
    if (automatic.length) h.store.append(h.conversation, 'memory_delta', 'Human-authorized model suppression', {
      expected_revision: memory.revision, records: [], source_event_id: user.id,
      changes: automatic.map(t => ({ memory_id: t.id, lifecycle: 'suppressed', active: false })),
    }, h.provider.name);
    const named = targets.filter(t => t.kind === 'named');
    if (named.length) h.updateState({ expected_revision: state.revision, updates: named.map(({ record: s }) => ({
      key: s.state_key, type: s.type, content: s.content, source_event_ids: s.source_event_ids,
      status: 'superseded', supersedes: [], supports: s.relations.supports, conflicts_with: s.relations.conflicts_with,
      limitations: s.resolution.limitations,
    })) });
    return h.store.append(h.conversation, 'memory_suppression', 'Human-authorized suppression across memory stores', {
      source_event_id: user.id, targets: targets.map(({ record: r, ...t }) => ({ ...t,
        ...(t.kind === 'named' ? { bundle_id: h.store.context(h.conversation).segments.find(s => s.state_key === t.id).id, source_event_ids: r.source_event_ids } : {}) })),
    }, h.provider.name);
  });
  // Start a new chain immediately, including Agent checkpoints. Earlier memory
  // snapshots/tool exchanges cannot carry suppressed text back into this loop.
  h.refreshProjection('memory suppression');
  try { h.store.writeView(h.conversation); } catch { /* Disposable view. */ }
  return { memory_revision: memoryView(h.store, h.conversation).revision, state_revision: h.store.context(h.conversation).revision,
    suppression_event_id: receipt.id, results: targets.map(t => ({ kind: t.kind, id: t.id,
      effective_status: t.kind === 'automatic' ? 'suppressed' : 'superseded' })),
    projection: 'refreshed; earlier tool exchanges archived', history_retained: true, erasure: false };
}
