// Build attribution from the immutable event log, never from model-written prose.
// Older assistant events kept their model only in inference records.
function writingResponse(previous, response, provider, path, operation) {
  if (previous?.kind !== 'tool_call' || previous.actor !== provider || previous.content !== operation
    || !['workspace_write', 'workspace_patch'].includes(operation) || response?.actor !== provider) return null;
  try {
    if (JSON.parse(previous.metadata.arguments).path !== path) return null;
  } catch { return null; }
  return response.metadata.output?.some(call => call.type === 'function_call' && call.call_id === previous.metadata.call_id
    && call.name === operation && call.arguments === previous.metadata.arguments) ? response : null;
}

// New writes retain an exact inference link; only audited tool calls establish a
// model author. Direct/manual calls and unverifiable older records stay unknown.
export function workspaceWriter(events, provider, path, operation) {
  const response = writingResponse(events.at(-1), events.findLast(e => e.kind === 'inference_response' && e.content === 'answer'), provider, path, operation);
  const request = response && events.find(e => e.id === response.metadata.request_id && e.metadata.provider === provider);
  return { provider, requested_model: request?.metadata.payload.model || null, model: response?.metadata.model || null,
    inference_request_id: request?.id || null, inference_response_event_id: response?.id || null,
    tool_call_id: response ? events.at(-1).metadata.call_id : null };
}

export function sourceIdentityIndex(events) {
  const requests = new Map(events.filter(e => e.kind === 'inference_request').map(e => [e.id, e]));
  const completed = new Set(events.filter(e => e.kind === 'turn_complete').map(e => e.metadata.assistant_event_id));
  const identities = new Map();
  let lastAnswer = null;
  let previous = null;
  for (const event of events) {
    const prior = previous;
    previous = event;
    if (event.kind === 'user') lastAnswer = null;
    if (event.kind === 'inference_response' && event.content === 'answer') lastAnswer = event;
    if (!['user', 'assistant', 'document', 'image', 'reasoning'].includes(event.kind)) continue;
    const identity = { event_id: event.id, kind: event.kind, actor: event.actor };
    if (['search-snippet', 'search-summary', 'page-text'].includes(event.metadata.evidence_scope)) Object.assign(identity, {
      source_url: event.metadata.source_url, search_provider: event.metadata.search_provider,
      retrieved_at: event.metadata.retrieved_at, evidence_scope: event.metadata.evidence_scope, external_data: true,
      derived_by: event.metadata.evidence_scope === 'search-summary' ? { provider: event.metadata.search_provider, model: event.metadata.requested_model } : null,
    });
    if (event.kind === 'reasoning') Object.assign(identity, { request_id: event.metadata.request_id,
      response_event_id: event.metadata.response_event_id, status: event.metadata.status, provider_reported_rationale: true });
    if (event.metadata.revises_event_id) identity.revises_event_id = event.metadata.revises_event_id;
    if (event.actor !== 'human') {
      const response = event.kind === 'assistant' && completed.has(event.id) && lastAnswer?.actor === event.actor ? lastAnswer :
        event.kind === 'document' ? writingResponse(prior, lastAnswer, event.actor, event.metadata.workspace_path, event.metadata.workspace_operation) : null;
      const request = response ? requests.get(response.metadata.request_id) : null;
      const requested = event.metadata.requested_model || request?.metadata.payload?.model || null;
      const reported = event.metadata.model || response?.metadata.model || null;
      Object.assign(identity, {
        provider: event.metadata.provider || request?.metadata.provider || event.actor,
        model: reported || requested, requested_model: requested, reported_model: reported,
      });
    }
    identities.set(event.id, identity);
  }
  return identities;
}
