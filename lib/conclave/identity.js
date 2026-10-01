// Build attribution from the immutable event log, never from model-written prose.
// Older assistant events kept their model only in inference records.
export function sourceIdentityIndex(events) {
  const requests = new Map(events.filter(e => e.kind === 'inference_request').map(e => [e.id, e]));
  const completed = new Set(events.filter(e => e.kind === 'turn_complete').map(e => e.metadata.assistant_event_id));
  const identities = new Map();
  let lastAnswer = null;
  for (const event of events) {
    if (event.kind === 'user') lastAnswer = null;
    if (event.kind === 'inference_response' && event.content === 'answer') lastAnswer = event;
    if (!['user', 'assistant', 'document'].includes(event.kind)) continue;
    const identity = { event_id: event.id, kind: event.kind, actor: event.actor };
    if (event.metadata.revises_event_id) identity.revises_event_id = event.metadata.revises_event_id;
    if (event.actor !== 'human') {
      const response = event.kind === 'assistant' && completed.has(event.id) && lastAnswer?.actor === event.actor ? lastAnswer : null;
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
