export const HANDOFF_MARKER = '\nCONCLAVE_CONTINUATION_OBSERVATIONS\n';
export function readHandoff(item) {
  if (item.role !== 'user' || typeof item.content !== 'string' || !item.content.includes(HANDOFF_MARKER)) return null;
  try { return JSON.parse(item.content.split(HANDOFF_MARKER)[1]); } catch { return null; }
}
export function deliveredCalls(events) {
  const completed = new Set(events.filter(e => e.kind === 'inference_response' && e.metadata.status === 'completed').map(e => e.metadata.request_id));
  const ids = new Set();
  for (const e of events) {
    if (e.kind !== 'inference_request' || e.content !== 'answer' || !completed.has(e.id)) continue;
    for (const item of e.metadata.payload?.input || []) {
      if (item.type === 'function_call_output') ids.add(item.call_id);
      for (const r of readHandoff(item)?.fresh_tool_results || []) ids.add(r.call_id);
    }
  }
  return ids;
}
export function observationRanges(payload) {
  const ranges = [];
  const collect = (value, callId) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.content === 'string' && Number.isSafeInteger(value.offset) && (value.source_event_id || value.event_id || value.sourceRef))
      ranges.push({ call_id: callId, source_event_id: value.source_event_id || value.event_id || null, sourceRef: value.sourceRef || null,
        offset: value.offset, end_offset: value.offset + value.content.length, next_offset: value.next_offset ?? null,
        scope: 'text supplied in this request; does not prove the model inspected or verified it' });
    for (const child of Object.values(value)) if (typeof child === 'object') collect(child, callId);
  };
  for (const item of payload.input || []) {
    if (item.type === 'function_call_output') { try { collect(JSON.parse(item.output), item.call_id); } catch {} }
    for (const r of readHandoff(item)?.fresh_tool_results || []) collect(r.result, r.call_id);
  }
  return ranges;
}
