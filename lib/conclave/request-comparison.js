import { inputSize } from './input-size.js';

const taskTools = new Set(['calculate', 'calculate_expression', 'workspace_list', 'workspace_read', 'workspace_write', 'workspace_patch']);

// A lightweight visual counterfactual, using the same instruction/tool overhead.
// Include chat and task-tool history, not private reasoning, management calls,
// or duplicate document versions already present in workspace tool exchanges.
export function requestComparison(payload, provider, events, request = null) {
  const history = events.filter(e => !request || e.seq < request.seq);
  const toolKey = e => `${e.metadata.request_id}:${e.metadata.call_id}`;
  const tools = new Map(history.filter(e => e.kind === 'tool_call' && taskTools.has(e.content))
    .map(e => [toolKey(e), e]));
  const input = history.flatMap(e => {
    if (['user', 'assistant'].includes(e.kind) || (e.kind === 'document' && e.actor === 'human' && !e.metadata.workspace_path))
      return [{ role: e.kind === 'assistant' && e.actor === provider.name ? 'assistant' : 'user', content: e.content }];
    if (e.kind === 'tool_call' && taskTools.has(e.content))
      return [{ role: 'user', content: `${e.actor} tool ${e.content}: ${e.metadata.arguments}` }];
    if (e.kind === 'tool_result' && tools.has(toolKey(e)))
      return [{ role: 'user', content: `${e.actor} tool result: ${e.content}` }];
    return [];
  });
  const response = request && events.findLast(e => e.kind === 'inference_response' && e.metadata.request_id === request.id);
  const reported = response?.metadata.usage?.input_tokens;
  const measured = Number.isSafeInteger(reported) && reported >= 0;
  return {
    phase: !request ? 'next' : response ? 'last' : 'current',
    request_id: request?.id || null,
    sent_tokens: measured ? reported : inputSize(payload, provider, events).estimated_tokens,
    sent_reported: measured,
    full_tokens: inputSize({ ...payload, input }, provider).estimated_tokens,
    fixed_tokens: inputSize({ ...payload, input: [] }, provider).estimated_tokens,
  };
}
