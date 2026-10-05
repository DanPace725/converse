// Offline memory-selection metrics. Labels grade selection, not factual truth.
export const MEMORY_LABELS_VERSION = 'memory-labels-v1';
export const LABELS = ['skip', 'optional', 'keep', 'preference', 'claim', 'question'];
const KINDS = ['preference', 'claim', 'question'];

// Two selectors over the same numbered passages.
export function compareSelections(a, b) {
  const left = new Map(a.map(r => [r.passage_id, r.kind])), right = new Map(b.map(r => [r.passage_id, r.kind]));
  const both = [...left.keys()].filter(id => right.has(id));
  const union = new Set([...left.keys(), ...right.keys()]).size;
  return { both: both.length, first_only: [...left.keys()].filter(id => !right.has(id)),
    second_only: [...right.keys()].filter(id => !left.has(id)),
    kind_matches: both.filter(id => left.get(id) === right.get(id)).length,
    jaccard: union ? both.length / union : 1 };
}

// `selections` maps event_id → [{ passage_id, kind }], or null when the selector
// failed on that event. Failed events are excluded and counted, not scored as misses.
// `optional` passages are neither misses nor false positives; `keep` grades selection only.
export function scoreSelections(items, selections) {
  const totals = { events: 0, failed_events: 0, labeled_passages: 0, unlabeled_passages: 0, required: 0,
    selected_labeled: 0, true_positive: 0, false_positive: 0, false_negative: 0, optional_selected: 0,
    kind_graded: 0, kind_correct: 0, misses: [], false_positives: [], kind_errors: [] };
  for (const item of items) {
    const chosen = selections[item.event_id];
    if (chosen === undefined) continue;
    if (chosen === null) { totals.failed_events++; continue; }
    totals.events++;
    const picked = new Map(chosen.map(r => [r.passage_id, r.kind]));
    for (const passage of item.passages) {
      const label = passage.label;
      if (!LABELS.includes(label)) { totals.unlabeled_passages++; continue; }
      totals.labeled_passages++;
      const ref = { event_id: item.event_id, passage_id: passage.passage_id };
      const required = label !== 'skip' && label !== 'optional';
      if (required) totals.required++;
      if (!picked.has(passage.passage_id)) {
        if (required) { totals.false_negative++; totals.misses.push({ ...ref, label }); }
        continue;
      }
      totals.selected_labeled++;
      if (label === 'optional') { totals.optional_selected++; continue; }
      if (label === 'skip') { totals.false_positive++; totals.false_positives.push({ ...ref, kind: picked.get(passage.passage_id) }); continue; }
      totals.true_positive++;
      if (KINDS.includes(label)) {
        totals.kind_graded++;
        if (picked.get(passage.passage_id) === label) totals.kind_correct++;
        else totals.kind_errors.push({ ...ref, label, kind: picked.get(passage.passage_id) });
      }
    }
  }
  const ratio = (n, d) => d ? n / d : null;
  const precision = ratio(totals.true_positive, totals.true_positive + totals.false_positive);
  const recall = ratio(totals.true_positive, totals.required);
  return { ...totals, precision, recall,
    f1: precision == null || recall == null ? null : precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    kind_accuracy: ratio(totals.kind_correct, totals.kind_graded) };
}

// Label file items from canonical export events. Only events the capture path
// would consider (human turns and completed assistant answers) are included.
export function labelItems(events, memoryPassages, { includeUser = true } = {}) {
  const completed = new Set(events.filter(e => e.kind === 'turn_complete').map(e => e.metadata?.assistant_event_id));
  return events.filter(e => e.kind === 'assistant' && completed.has(e.id)
    || includeUser && e.kind === 'user' && e.actor === 'human' && !e.metadata?.purpose?.startsWith('manual-'))
    .map(e => ({ event_id: e.id, source_kind: e.kind, passages: memoryPassages(e)
      .map(p => ({ passage_id: p.passage_id, content: p.content, label: null })) }))
    .filter(item => item.passages.length);
}
