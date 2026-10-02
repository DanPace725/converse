// A read-only, bounded projection of the audit log for the context garden.
// No inference payloads, provider outputs or credentials cross this boundary.
const sources = "kind IN ('user','assistant','document','reasoning')";
const kinds = "kind IN ('user','assistant','document','reasoning','context_transform','inference_request','inference_response','inference_failure','decision_proposal','decision_rejection','attention_decision','context_skip','context_rejection','tool_call','tool_result','turn_complete','turn_failure')";

function context(value) {
  return { revision: value.revision, text_bytes: value.segments.reduce((sum, item) => sum + Buffer.byteLength(item.content, 'utf8'), 0),
    segments: value.segments.map((item) => ({
    id: item.id, type: item.type, status: item.status, state_key: item.state_key || null,
    pinned: item.pinned, verbatim_required: !!item.verbatim_required,
    parent_bundle_ids: item.parent_bundle_ids, source_event_ids: item.source_event_ids,
    ref_bundle_id: item.ref_bundle_id || null, chars: item.content.length, preview: item.content.slice(0, 160),
  })) };
}

function event(row, db) {
  const m = JSON.parse(row.metadata);
  const result = { seq: row.seq, id: row.id, kind: row.kind, timestamp: row.timestamp,
    label: ['user','assistant','document','reasoning'].includes(row.kind) ? row.kind : row.content.slice(0, 140),
    revision: m.revision ?? m.context_revision ?? null, tool: m.tool || m.name || null,
    selected_ids: m.selected_bundle_ids || [], retained_ids: m.retained_bundle_ids || [],
    removed_ids: m.removed_bundle_ids || [], source_ids: [], provider: m.provider || null };
  if (row.kind === 'context_transform') {
    // Older receipts embed their segments; newer ones are read from the snapshot they produced.
    const snapshot = m.segments ? null : db.prepare('SELECT segments FROM snapshots WHERE conversation_id=? AND revision=? AND receipt_id=?').get(row.conversation_id, m.revision, row.id);
    result.context = context({ revision: m.revision, segments: m.segments || JSON.parse(snapshot?.segments || '[]') });
  }
  if (row.kind === 'tool_result') {
    try {
      const value = JSON.parse(row.content);
      const items = Array.isArray(value) ? value : [value, ...(value.results || [])];
      result.source_ids = [...new Set(items.flatMap((item) => [item.event_id, item.source_event_id, ...(item.source_event_ids || [])]).filter(Boolean))];
    } catch { /* A malformed result remains in the canonical audit log. */ }
  }
  return result;
}

export function activity(store, conversation, { after = 0, replay = false, busy = false } = {}) {
  const db = store.db;
  const max = db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM events WHERE conversation_id=?').get(conversation).seq;
  const historyAt = (seq) => {
    const stats = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(length(CAST(content AS BLOB))),0) AS text_bytes FROM events WHERE conversation_id=? AND seq<=? AND ${sources}`).get(conversation, seq);
    const items = db.prepare(`SELECT id,kind,seq,substr(content,1,160) AS preview FROM events WHERE conversation_id=? AND seq<=? AND ${sources} ORDER BY seq DESC LIMIT 96`).all(conversation, seq).reverse();
    return { ...stats, items };
  };
  let rows;
  if (replay || !after) rows = db.prepare(`SELECT * FROM events WHERE conversation_id=? AND ${kinds} ORDER BY seq DESC LIMIT ?`).all(conversation, replay ? 80 : 1).reverse();
  else rows = db.prepare(`SELECT * FROM events WHERE conversation_id=? AND seq>? AND ${kinds} ORDER BY seq LIMIT 64`).all(conversation, after);
  const events = rows.map((row) => event(row, db));
  for (const item of events) if (item.context) item.history = historyAt(item.seq);
  const cursor = after && !replay && rows.length === 64 ? rows.at(-1).seq : max;
  const latest = db.prepare(`SELECT * FROM events WHERE conversation_id=? AND ${kinds} ORDER BY seq DESC LIMIT 1`).get(conversation);
  const response = { conversation_id: conversation, cursor, has_more: cursor < max,
    busy, context: context(store.context(conversation)), history: historyAt(max), events, latest: latest ? event(latest, db) : null };
  if (replay) {
    const firstSeq = rows[0]?.seq || max;
    const previous = db.prepare('SELECT s.revision,s.segments FROM snapshots s JOIN events e ON e.id=s.receipt_id WHERE s.conversation_id=? AND e.seq<? ORDER BY s.revision DESC LIMIT 1').get(conversation, firstSeq);
    response.initial_context = previous ? context({ ...previous, segments: JSON.parse(previous.segments) }) : context({ revision: 0, segments: [] });
    response.initial_history = historyAt(firstSeq - 1);
  }
  return response;
}
