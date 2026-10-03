import { inputSize, tokenize } from './input-size.js';

// Tools a plain full-history chat would also have run and carried. Conclave's
// own context-management and retrieval tools exist only because history is managed.
const taskTools = new Set(['calculate', 'calculate_expression', 'workspace_list', 'workspace_read', 'workspace_write', 'workspace_patch',
  'web_search', 'web_fetch', 'read_app_guide', 'query_clp']);

const text = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.map(part => part.text ?? part.content ?? '').join('\n') : JSON.stringify(content ?? '');
// A projection message is one header line, one line of segment JSON, then guard/pointer lines.
function projection(content) {
  if (!/^(Working context|Recent context tail)/.test(content)) return null;
  const [head, body = '', ...rest] = content.split('\n');
  try {
    const segments = JSON.parse(body);
    return Array.isArray(segments) ? { segments, framing: [head, ...rest].join('\n') } : null;
  } catch { return null; }
}

const breakdowns = new Map();
// Where one request's input went, by part, in local o200k_base tokens. Each part
// is counted on its own text; `framing` also holds the serialized-payload remainder,
// so the parts sum to the same local estimate used for the whole request.
export function requestBreakdown(payload, provider) {
  const whole = inputSize(payload, provider);
  if (breakdowns.has(whole.fingerprint)) return breakdowns.get(whole.fingerprint);
  const parts = new Map(['instructions', 'tools', 'memory', 'context', 'files', 'turn', 'reasoning', 'framing']
    .map(key => [key, { key, tokens: 0, items: [] }]));
  const add = (key, value, item) => {
    const tokens = tokenize(value), part = parts.get(key);
    part.tokens += tokens;
    if (item) part.items.push({ ...item, tokens });
  };
  add('instructions', payload.instructions || '');
  for (const tool of payload.tools || []) add('tools', JSON.stringify(tool), { label: tool.name || tool.type });
  const calls = new Map();
  for (const item of payload.input || []) {
    if (item.type === 'function_call') {
      calls.set(item.call_id, item.name);
      add('turn', item.name + ' ' + (item.arguments || ''), { label: item.name, kind: 'call' });
    } else if (item.type === 'function_call_output')
      add('turn', text(item.output), { label: calls.get(item.call_id) || 'tool', kind: 'result' });
    // Encrypted or signed reasoning is opaque here; its encoding overstates its billed size.
    else if (item.type === 'reasoning') add('reasoning', JSON.stringify(item), { label: 'Carried reasoning', kind: 'opaque' });
    else {
      const content = text(item.content), view = projection(content);
      if (view) {
        add('framing', view.framing);
        for (const s of view.segments)
          add(s.state_key ? 'memory' : s.type === 'evidence' && String(s.content).startsWith('Workspace ') ? 'files' : 'context',
            JSON.stringify(s), { ref: s.id, label: s.state_key || s.type, kind: s.state_key ? 'state' : s.type,
              ...(s.pinned || s.verbatim_required ? { pinned: true } : {}) });
      } else if (content.startsWith('Conversation memory:\n')) {
        add('framing', 'Conversation memory:');
        for (const r of JSON.parse(content.slice('Conversation memory:\n'.length)))
          add('memory', JSON.stringify(r), { ref: r.memory_id, label: r.kind, kind: 'memory' });
      } else if (content.startsWith('Current saved workspace manifest')) add('files', content, { label: 'Workspace manifest', kind: 'manifest' });
      else if (content.startsWith('[Source ')) add('context', content, { label: item.role === 'assistant' ? 'assistant' : 'source', kind: 'source' });
      else if (content.startsWith('Continue the latest user objective')) add('turn', content, { label: 'Archived tool results', kind: 'handoff' });
      else add('turn', content, { label: item.role === 'assistant' || item.type === 'message' ? 'Reply text so far' : 'Follow-up note', kind: 'note' });
    }
  }
  const counted = [...parts.values()].reduce((sum, part) => sum + part.tokens, 0);
  parts.get('framing').tokens += Math.max(0, whole.tokenizer_tokens - counted);
  const result = { method: 'local-o200k_base-per-part', estimated_tokens: Math.max(whole.tokenizer_tokens, counted),
    parts: [...parts.values()].filter(part => part.tokens).map(part => {
      const items = part.items.sort((a, b) => b.tokens - a.tokens);
      return { ...part, items: items.slice(0, 60), items_omitted: Math.max(0, items.length - 60) };
    }) };
  if (breakdowns.size >= 64) breakdowns.delete(breakdowns.keys().next().value);
  breakdowns.set(whole.fingerprint, result);
  return result;
}

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
  const breakdown = requestBreakdown(payload, provider);
  return {
    phase: !request ? 'next' : response ? 'last' : 'current',
    request_id: request?.id || null,
    sent_tokens: measured ? reported : inputSize(payload, provider, events).estimated_tokens,
    sent_reported: measured,
    // Same local basis as full_tokens, for a like-for-like size comparison.
    sent_estimated_tokens: breakdown.estimated_tokens,
    full_tokens: inputSize({ ...payload, input }, provider).estimated_tokens,
    fixed_tokens: inputSize({ ...payload, input: [] }, provider).estimated_tokens,
    // Reported usage the local count does not explain: provider framing and tokenizer differences.
    breakdown: { ...breakdown, reported_tokens: measured ? reported : null,
      unattributed_tokens: measured ? reported - breakdown.estimated_tokens : null },
  };
}
