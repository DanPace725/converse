import { reasoningRecords } from './reasoning.js';
import { removedSources } from './documents.js';
import { stopDetail } from './agent-diagnostics.js';

// This display view deliberately has no context segments, workspace, request
// estimates or audit. Mutations and exports still use the complete engine view.
export function transcriptView(events, conversation, { revision, state, checkpoint, title, createdAt, busy = false }) {
  const files = new Map();
  for (const event of events) if (event.kind === 'document' && event.metadata.workspace_path)
    files.set(event.metadata.workspace_path, { path: event.metadata.workspace_path, source_event_id: event.id });
  const removed = removedSources(events);
  let agent = null;
  if (state) {
    const { pending, protected_ids, continuation, ...visible } = state;
    checkpoint ||= events.findLast(e => e.kind === 'agent_checkpoint');
    agent = { ...visible, files: [], tools: [], metrics: null,
      stop: state.status === 'running' ? null : state.stop || stopDetail(state.status, state, state.error),
      elapsed_seconds: Math.max(0, ((Date.parse(state.finished_at || (state.status !== 'running' && checkpoint?.timestamp)) || Date.now()) - Date.parse(state.started_at)) / 1000) };
  }
  return { schema_version: 1, view_kind: 'transcript', conversation_id: conversation,
    title: title ?? events.findLast(e => e.kind === 'conversation_title')?.content ?? events[0]?.content,
    created_at: createdAt ?? events[0]?.timestamp ?? null,
    title_generated: events.some(e => e.kind === 'conversation_title'),
    ...transcriptFields(events, conversation), context: { revision }, agent, busy,
    workspace: [...files.values()].filter(file => !removed.has(file.source_event_id)) };
}

export const conversationDefaults = { provider: 'openai', model: 'gpt-6-luna', reasoning: 'low', budget: 256000, output: 16384, jev: true, freezeProjection: true };
const defaults = conversationDefaults;

export function transcriptFields(events, conversation) {
    const requests = new Map(events.filter((e) => e.kind === 'inference_request').map((e) => [e.id, e]));
    const completed = new Map(events.filter((e) => e.kind === 'turn_complete').map((e) => [e.metadata.assistant_event_id, e.metadata.user_event_id]));
    const rationales = reasoningRecords(events);
    const failures = new Map(events.filter(e => e.kind === 'turn_failure').map(e => [e.metadata.user_event_id, e]));
    const byId = new Map(events.map(e => [e.id, e]));
    const byUser = new Map();
    for (const rationale of rationales) {
      if (!byUser.has(rationale.user_event_id)) byUser.set(rationale.user_event_id, []);
      byUser.get(rationale.user_event_id).push(rationale);
    }
    const preceding = new Map();
    let latestResponse = null;
    for (const event of events) {
      if (event.kind === 'assistant') preceding.set(event.id, latestResponse);
      if (event.kind === 'inference_response' && event.content === 'answer') latestResponse = event;
    }
    const messages = events.filter((e) => ['user', 'assistant'].includes(e.kind) && !e.metadata.purpose?.startsWith('manual-')).map((e) => {
      const userEvent = completed.get(e.id);
      const response = e.kind === 'assistant' ? preceding.get(e.id) : null;
      const request = response ? requests.get(response.metadata.request_id) : null;
      const user = userEvent ? byId.get(userEvent) : null;
      const model = response?.metadata.model || request?.metadata.payload.model || 'unknown';
      const provider = (request?.metadata.provider || e.actor) === 'anthropic' ? 'Claude' : 'GPT';
      const record = { message_id: e.metadata.client_message_id || e.id, source_event_id: e.id, timestamp: e.timestamp,
        participant_id: e.kind === 'user' ? 'human' : provider.toLowerCase(), role: e.kind, content: e.content,
        reply_to: user?.metadata.client_message_id || userEvent || null, mentions: [], attachment_ids: e.metadata.attachment_ids || [], status: 'complete' };
      if (e.kind === 'user') {
        record.reasoning = byUser.get(e.id) || [];
        const failure = failures.get(e.id);
        if (failure) { record.answer_failed = true; record.failure = failure.content; }
      }
      if (e.metadata.revises_message_id) record.revises_message_id = e.metadata.revises_message_id;
      if (e.kind === 'assistant') Object.assign(record, { provider, model, usage: response?.metadata.usage || null, pricing: null, estimated_cost_usd: null,
        invocation: { engine: 'conclave', conversation_id: conversation, request_event_id: request?.id || null,
          response_event_id: response?.id || null, context_revision: request?.metadata.context_revision ?? null,
          requested_model: request?.metadata.payload.model || null, reported_model: response?.metadata.model || null,
          response_id: response?.metadata.response_id || null, generation_settings: request ? {
            max_output_tokens: request.metadata.payload.max_output_tokens, reasoning: request.metadata.payload.reasoning,
          } : null, context_message_ids: null, provenance_note: 'Full transformed inputs, tool exchanges and source IDs are in context_layer.events.' } });
      return record;
    });
    const attachments = events.filter((e) => e.kind === 'document' && e.metadata.attachment_id).map((e) => ({
      attachment_id: e.metadata.attachment_id, name: e.metadata.filename, mime_type: e.metadata.mime_type,
      sha256: e.metadata.sha256, source_sha256: e.metadata.source_sha256, content: e.content, source_event_id: e.id,
    }));
    const lastRequest = events.findLast((e) => e.kind === 'inference_request' && e.content === 'answer');
    const lastUser = events.findLast((e) => e.kind === 'user' && e.metadata.web_settings);
    const settings = { ...defaults, ...(lastUser?.metadata.web_settings || { provider: lastRequest?.metadata.provider || defaults.provider, model: lastRequest?.metadata.payload.model || defaults.model,
      reasoning: lastRequest?.metadata.payload.reasoning?.effort || defaults.reasoning, jev: true }) };
    return { messages, attachments: attachments.filter(a => !removedSources(events).has(a.source_event_id)), settings };
}
