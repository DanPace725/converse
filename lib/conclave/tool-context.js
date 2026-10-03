const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const readTools = new Set(['search_history', 'retrieve_event', 'retrieve_range', 'resolve_context', 'workspace_read', 'read_telemetry', 'inspect_context', 'read_app_guide', 'web_search']);

// Shrink temporary retrieval excerpts only. Call IDs, reasoning, sources, and the
// live projection remain intact; canonical tool_result events retain full output.
export function fitToolExchanges(payload, maximumBytes) {
  const fitted = structuredClone(payload);
  const calls = new Map(fitted.input.filter((s) => s.type === 'function_call').map((s) => [s.call_id, s.name]));
  const results = fitted.input.filter((s) => s.type === 'function_call_output' && readTools.has(calls.get(s.call_id)))
    .map((item) => {
      try { return { item, original: item.output, value: JSON.parse(item.output) }; } catch { return null; }
    }).filter(Boolean);
  const excerpts = [];
  const collect = (value, result) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.content === 'string') excerpts.push({ value, result });
    for (const child of Object.values(value)) if (typeof child === 'object') collect(child, result);
  };
  for (const result of results) collect(result.value, result);
  while (bytes(fitted) > maximumBytes) {
    const largest = excerpts.filter((e) => e.value.content.length).sort((a, b) => b.value.content.length - a.value.content.length)[0];
    if (!largest) break;
    largest.value.content = largest.value.content.slice(0, Math.floor(largest.value.content.length / 2));
    largest.value.truncated = true;
    if (Number.isSafeInteger(largest.value.offset)) largest.value.next_offset = largest.value.offset + largest.value.content.length;
    largest.result.item.output = JSON.stringify(largest.result.value);
  }
  return { payload: fitted, projections: results.filter((r) => r.item.output !== r.original).map((r) => ({
    call_id: r.item.call_id, before_bytes: bytes(r.original), after_bytes: bytes(r.item.output),
    reason: 'Retrieval excerpt shortened to fit continuation; full tool output remains in history.',
  })) };
}
