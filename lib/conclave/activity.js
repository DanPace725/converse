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

// Snapshots are immutable, so their text size can be cached per revision.
const revisionBytes = new Map();
function workingBytes(db, conversation, revision) {
  if (!revision) return 0;
  const key = conversation + ':' + revision;
  if (!revisionBytes.has(key)) {
    const row = db.prepare('SELECT segments FROM snapshots WHERE conversation_id=? AND revision=? LIMIT 1').get(conversation, revision);
    const segments = row ? JSON.parse(row.segments) : null;
    if (!segments) return null;
    if (revisionBytes.size > 2000) revisionBytes.clear();
    revisionBytes.set(key, segments.reduce((sum, item) => sum + Buffer.byteLength(item.content || '', 'utf8'), 0));
  }
  return revisionBytes.get(key);
}

// Running estimate of what the mutable context avoided sending. For each answer
// request: saved source text minus the working context it actually used, in
// that request's calibrated tokens. Management calls (Jev, compaction) are the cost.
export function savings(db, conversation) {
  // Request metadata carries whole payloads; extract only the fields used here.
  const rows = db.prepare(`SELECT id,kind,content,length(CAST(content AS BLOB)) AS bytes,
      json_extract(metadata,'$.context_revision') AS revision, json_extract(metadata,'$.input_size.bytes') AS input_bytes,
      json_extract(metadata,'$.request_id') AS request_id, json_extract(metadata,'$.usage.input_tokens') AS input_tokens,
      json_extract(metadata,'$.usage.output_tokens') AS output_tokens
    FROM events WHERE conversation_id=? AND (${sources} OR kind IN ('inference_request','inference_response')) ORDER BY seq`).all(conversation);
  const requests = new Map();
  let history = 0, avoided = 0, sent = 0, managing = 0, count = 0;
  for (const row of rows) {
    if (row.kind === 'inference_request') {
      requests.set(row.id, { purpose: row.content, history, revision: row.revision ?? null, bytes: row.input_bytes || null });
      continue;
    }
    if (row.kind !== 'inference_response') { history += row.bytes; continue; }
    const request = requests.get(row.request_id), usage = { input_tokens: row.input_tokens, output_tokens: row.output_tokens };
    if (!request) continue;
    if (request.purpose !== 'answer') {
      managing += (usage.input_tokens || 0) + (usage.output_tokens || 0);
      continue;
    }
    const working = workingBytes(db, conversation, request.revision);
    if (working === null) continue;
    const perByte = Number.isSafeInteger(usage.input_tokens) && request.bytes ? usage.input_tokens / request.bytes : 1 / 3;
    count++;
    sent += usage.input_tokens || 0;
    avoided += Math.max(0, request.history - working) * perByte;
  }
  return { requests: count, sent_tokens: sent, avoided_tokens: Math.round(avoided), management_tokens: managing,
    method: 'source-text-minus-working-context-calibrated-per-request' };
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
    busy, context: context(store.context(conversation)), history: historyAt(max), events, latest: latest ? event(latest, db) : null,
    savings: savings(db, conversation) };
  if (replay) {
    const firstSeq = rows[0]?.seq || max;
    const previous = db.prepare('SELECT s.revision,s.segments FROM snapshots s JOIN events e ON e.id=s.receipt_id WHERE s.conversation_id=? AND e.seq<? ORDER BY s.revision DESC LIMIT 1').get(conversation, firstSeq);
    response.initial_context = previous ? context({ ...previous, segments: JSON.parse(previous.segments) }) : context({ revision: 0, segments: [] });
    response.initial_history = historyAt(firstSeq - 1);
  }
  return response;
}
