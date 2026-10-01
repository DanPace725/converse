import { segment } from './store.js';

export const STATE_VERSION = 'task-state-v1';
export const STATE_TYPES = ['objective', 'constraint', 'decision', 'question', 'evidence'];
const strings = { type: 'array', items: { type: 'string' } };
const fields = {
  key: { type: 'string' }, type: { type: 'string', enum: STATE_TYPES }, content: { type: 'string' },
  source_event_ids: strings, status: { type: 'string', enum: ['active', 'unresolved', 'superseded'] },
  supersedes: strings, conflicts_with: strings, supports: strings, limitations: strings,
};
export const stateUpdateSchema = { type: 'object', properties: fields, required: Object.keys(fields), additionalProperties: false };

export function validateState(item) {
  if (typeof item.state_key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(item.state_key) || !STATE_TYPES.includes(item.type)
    || item.content.length > 2000 || !item.relations || !item.resolution || !Array.isArray(item.attribution)) throw Error('Invalid structured state');
  for (const name of ['supersedes', 'conflicts_with', 'supports']) {
    const refs = item.relations[name];
    if (!Array.isArray(refs) || refs.length > 16 || refs.some((r) => typeof r !== 'string' || r === item.id)) throw Error('Invalid state relations');
  }
  if (item.resolution.confidence !== null || !['reported', 'unresolved'].includes(item.resolution.status)
    || !Array.isArray(item.resolution.limitations) || item.resolution.limitations.length > 16
    || item.resolution.limitations.some((s) => typeof s !== 'string' || s.length > 500)) throw Error('Invalid state resolution');
}

export function prepareState(store, conversation, current, updates) {
  if (!Array.isArray(updates) || !updates.length || updates.length > 8) throw Error('Supply 1–8 state updates');
  const keys = new Set(), removed = new Set(), additions = [];
  for (const update of updates) {
    if (update && Object.keys(update).some((key) => !Object.hasOwn(fields, key))) throw Error('Unknown state update field');
    if (!update || typeof update.content !== 'string' || !update.content.trim() || !Array.isArray(update.source_event_ids)
      || !update.source_event_ids.length || !['active', 'unresolved', 'superseded'].includes(update.status)) throw Error('Invalid state update');
    if (keys.has(update.key)) throw Error('Duplicate state key in batch');
    keys.add(update.key);
    const old = current.segments.find((s) => s.state_key === update.key);
    if (old?.pinned || old?.verbatim_required) throw Error(`Protected state cannot be replaced: ${old.id}`);
    const sources = [...new Set(update.source_event_ids)].map((eventId) => store.source(conversation, eventId));
    const relations = Object.fromEntries(['supersedes', 'conflicts_with', 'supports'].map((name) => {
      if (!Array.isArray(update[name]) || update[name].some((r) => typeof r !== 'string')) throw Error('Invalid relationship list');
      return [name, [...new Set([...update[name], ...(name === 'supersedes' && old ? [old.id] : [])])]];
    }));
    for (const ref of Object.values(relations).flat()) store.resolveBundle(conversation, ref);
    if (relations.supersedes.some((r) => relations.conflicts_with.includes(r) || relations.supports.includes(r))) throw Error('A superseded entry cannot also support or conflict with its replacement');
    const item = segment(update.content.trim(), update.source_event_ids, {
      type: update.type, state_key: update.key, status: relations.conflicts_with.length ? 'unresolved' : update.status,
      parent_bundle_ids: [...new Set([...(old ? [old.id] : []), ...relations.supersedes])], relations,
      attribution: sources.map((s) => ({ event_id: s.id, kind: s.kind, actor: s.actor })),
      resolution: { status: update.status === 'unresolved' || relations.conflicts_with.length ? 'unresolved' : 'reported',
        confidence: null, limitations: update.limitations },
    });
    validateState(item);
    if (old) removed.add(old.id);
    // Explicit supersession of another live state retires that head too, preserving its original bundle.
    for (const ref of relations.supersedes) {
      const target = current.segments.find((s) => s.id === ref);
      if (target?.state_key) {
        if (target.pinned || target.verbatim_required) throw Error(`Protected state cannot be superseded: ${ref}`);
        removed.add(ref);
      }
    }
    additions.push(item);
  }
  return { segments: current.segments.filter((s) => !removed.has(s.id)).concat(additions),
    details: { state_version: STATE_VERSION, removed_bundle_ids: [...removed], added_bundle_ids: additions.map((s) => s.id),
      state_keys: additions.map((s) => s.state_key) } };
}

export function stateView(store, conversation) {
  const context = store.context(conversation);
  const entries = context.segments.filter((s) => s.state_key);
  const conflicts = entries.flatMap((s) => s.relations.conflicts_with.map((ref) => ({ from: s.id, to: ref })));
  return { revision: context.revision, state_version: STATE_VERSION,
    entries: entries.map((s) => ({ ...s, effective_status: conflicts.some((r) => r.from === s.id || r.to === s.id) ? 'unresolved' : s.status })),
    conflicts, confidence_note: 'Source-attributed reports; confidence is unknown, not independently verified.' };
}

export function checkAttribution(store, conversation, item) {
  const expected = item.source_event_ids.map((eventId) => {
    const s = store.source(conversation, eventId);
    return { event_id: s.id, kind: s.kind, actor: s.actor };
  });
  // JSONB may reorder object fields; validate the source values, not their serialization order.
  if (!Array.isArray(item.attribution) || item.attribution.length !== expected.length
    || expected.some((source, index) => {
      const actual = item.attribution[index];
      return !actual || Object.keys(actual).length !== 3
        || ['event_id', 'kind', 'actor'].some((key) => actual[key] !== source[key]);
    })) throw Error('State attribution differs from its sources');
}
