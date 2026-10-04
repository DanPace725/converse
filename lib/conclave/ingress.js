// These are temporary views. Canonical documents and tool receipts stay intact.
export const INGRESS_POLICY = 'bounded-ingress-v1';
export function documentIngress(content, focus = '', match = null, classification = null) {
  const offset = match?.offset || 0;
  const category = classification?.category || (match ? 'evidence' : 'reference');
  // Classification never promotes untrusted text into named state or pins.
  const length = category === 'reference' && !match ? 320 : 2000;
  return { offset, content: content.slice(offset, offset + length), category,
    matched: !!match, next_offset: offset + length < content.length ? offset + length : null,
    policy_version: INGRESS_POLICY, classification_source: classification ? 'bounded-model' : 'deterministic' };
}

export function toolIngress(name, result, eventId) {
  // Let the answering model inspect directly fetched text before managing it.
  // Request fitting may still page an oversized response, without summarizing.
  if (name === 'web_fetch' || result.evidence_scope === 'page-text') return { output: JSON.stringify(result), changed: false };
  // Current file pages are required for exact editing and readback. Bound them
  // through workspace_read's existing pagination, never through summarization.
  const maximum = ['workspace_read', 'read_app_guide', 'read_memory'].includes(name) ? 8000 : 1600;
  const view = structuredClone(result);
  let changed = false;
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'content' && typeof child === 'string' && child.length > maximum) {
        value.content = child.slice(0, maximum);
        value.truncated = true;
        value.total_characters ??= child.length;
        if (Number.isSafeInteger(value.offset)) value.next_offset = value.offset + maximum;
        changed = true;
      } else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(view);
  if (!['workspace_read', 'read_app_guide', 'read_memory'].includes(name) && Buffer.byteLength(JSON.stringify(view)) > 12000) {
    if (name === 'query_clp' && Array.isArray(result.rows)) {
      // Keep admission/withholding visible even when large payloads or lineage
      // are offloaded. The exact typed content and citations stay in the receipt.
      return { output: JSON.stringify({ version: result.version,
        rows: result.rows.map(row => ({ id: row.id, frame: row.frame, frame_version: row.frame_version })),
        explain: result.explain.map(item => ({ row_id: item.row_id, frame_version: item.frame_version, frame_event_id: item.frame_event_id,
          why: item.why, resolution_status: item.resolution_status, evidence: {
            support_count: item.evidence.support_count, diversity: item.evidence.diversity, confidence: null, separation: null,
          } })),
        telemetry: { ...result.telemetry, unresolved_clusters: result.telemetry.unresolved_clusters.map(item => ({ key: item.key, frame: item.frame, reason: item.reason })) },
        next_offset: result.next_offset, truncated: true, receipt_event_id: eventId,
        retrieval: 'Typed content and complete evidence: retrieve_event with receipt_event_id and offset 0; follow next_offset',
        ingress_policy: INGRESS_POLICY }), changed: true };
    }
    const fields = ['revision', 'observed_revision', 'status', 'error', 'path', 'source_event_id', 'previous_source_event_id', 'verification_required', 'updated_keys', 'state_updates'];
    const header = Object.fromEntries(fields.filter(k => Object.hasOwn(result, k)).map(k => [k, result[k]]));
    return { output: JSON.stringify({ ...header, receipt_event_id: eventId, truncated: true,
      retrieval: 'retrieve_event with receipt_event_id and offset 0; follow next_offset', ingress_policy: INGRESS_POLICY }), changed: true };
  }
  // Avoid attaching properties to array results (JSON.stringify drops them).
  return { output: JSON.stringify(changed ? { result: view, receipt_event_id: eventId,
    retrieval: 'retrieve_event with receipt_event_id and offset; follow next_offset', ingress_policy: INGRESS_POLICY } : view), changed };
}

// Only completed, earlier observations may be replaced. A current page remains
// available; historical versions are explicitly labelled and retrievable.
export function projectReceipts(payload, events) {
  const fitted = structuredClone(payload), projections = [];
  const results = fitted.input.filter(i => i.type === 'function_call_output');
  const receipts = new Map(events.filter(e => e.kind === 'tool_result').map(e => [e.metadata.call_id, e]));
  const observedPages = new Set();
  for (const event of events.filter(e => e.kind === 'inference_request' && e.content === 'answer'))
    for (const item of event.metadata.payload?.input || []) {
      if (item.type !== 'function_call_output') continue;
      try {
        const value = JSON.parse(item.output);
        if (value.evidence_scope === 'page-text' && typeof value.content === 'string') observedPages.add(item.call_id);
      } catch {}
    }
  const latestVersions = new Map(events.filter(e => e.kind === 'document' && e.metadata.workspace_path)
    .map(e => [e.metadata.workspace_path, e.id]));
  const latestPages = new Map();
  for (const item of results) {
    try {
      const value = JSON.parse(item.output);
      if (value.path && value.source_event_id && typeof value.content === 'string')
        latestPages.set(`${value.path}:${value.source_event_id}:${value.offset}`, item.call_id);
    } catch {}
  }
  for (const item of results) {
    const receipt = receipts.get(item.call_id);
    if (!receipt) continue;
    let value;
    try { value = JSON.parse(item.output); } catch { continue; }
    if (value.evidence_scope === 'page-text' && value.source_event_id && typeof value.content === 'string'
      && observedPages.has(item.call_id) && item !== results.at(-1)) {
      const { content, ...pointer } = value;
      item.output = JSON.stringify({ ...pointer, archived: true, omitted_characters: content.length,
        receipt_event_id: receipt.id, retrieval: 'retrieve_event with source_event_id and offset 0 for exact saved page text' });
      projections.push({ call_id: item.call_id, before_bytes: Buffer.byteLength(receipt.content),
        after_bytes: Buffer.byteLength(item.output), reason: 'Previously observed web page text archived with exact source retrieval' });
      continue;
    }
    if (!value.path || !value.source_event_id || typeof value.content !== 'string') continue;
    const current = latestVersions.get(value.path);
    const superseded = !!current && current !== value.source_event_id;
    const repeated = latestPages.get(`${value.path}:${value.source_event_id}:${value.offset}`) !== item.call_id;
    if (!superseded && !repeated) continue;
    const { content, ...pointer } = value;
    item.output = JSON.stringify({ ...pointer, historical: true, superseded,
      ...(superseded ? { current_source_event_id: current } : {}), receipt_event_id: receipt.id,
      retrieval: 'retrieve_event with receipt_event_id and offset 0 for the original receipt',
      omitted_characters: content.length });
    projections.push({ call_id: item.call_id, before_bytes: Buffer.byteLength(receipt.content),
      after_bytes: Buffer.byteLength(item.output), reason: superseded ? 'Superseded workspace page' : 'Repeated workspace page' });
  }
  const completed = new Set(results.map(i => i.call_id));
  for (const call of fitted.input.filter(i => i.type === 'function_call' && ['workspace_write', 'workspace_patch', 'workspace_patch_batch'].includes(i.name))) {
    if (!completed.has(call.call_id) || Buffer.byteLength(call.arguments || '') < 4000) continue;
    const receipt = receipts.get(call.call_id);
    if (!receipt) continue;
    let value;
    try { value = JSON.parse(receipt.content); } catch { continue; }
    if (value.error || !value.source_event_id) continue;
    const before = Buffer.byteLength(call.arguments);
    call.arguments = JSON.stringify({ path: value.path, completed: true, source_event_id: value.source_event_id,
      receipt_event_id: receipt.id, archived_arguments: true,
      retrieval: 'retrieve_event with source_event_id for the resulting document; this call already ran' });
    // Native tool_use is part of a signed prefix. Its projected saving is used
    // only to start a fresh chain, never to submit an altered signed exchange.
    if (call.anthropic_content?.type === 'tool_use') call.anthropic_content.input = JSON.parse(call.arguments);
    projections.push({ call_id: call.call_id, before_bytes: before, after_bytes: Buffer.byteLength(call.arguments),
      reason: 'Completed workspace write arguments archived with source retrieval' });
  }
  return { payload: fitted, projections };
}
