import { execFileSync } from 'node:child_process';
import { readEvents } from './stream.js';
import { reasoningSettings } from './reasoning.js';
import { withResponseDeadline } from './response-deadline.js';
const credentials = new Set();
function anthropicUsage(usage) {
  return usage ? { ...usage, input_tokens: Number.isSafeInteger(usage.input_tokens)
    ? usage.input_tokens + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) : null } : null;
}

export function environment(name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw Error('Invalid environment variable name');
  if (process.env[name]) { if (/KEY|TOKEN/.test(name)) credentials.add(process.env[name]); return process.env[name]; }
  if (process.platform !== 'win32') return undefined;
  // The child output stays in memory; never print or save credential values.
  const script = `$v=[Environment]::GetEnvironmentVariable('${name}','User'); if (!$v) { $v=[Environment]::GetEnvironmentVariable('${name}','Machine') }; if ($v) { [Console]::Write($v) }`;
  const value = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (value) { process.env[name] = value; if (/KEY|TOKEN/.test(name)) credentials.add(value); }
  return value || undefined;
}

export function redact(error) {
  let message = error.message || String(error);
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'TYPESAFE_API_KEY', 'JEV_API_KEY']) {
    if (process.env[name]) message = message.split(process.env[name]).join('[redacted]');
  }
  for (const credential of credentials) message = message.split(credential).join('[redacted]');
  return message;
}

// Native typed decisions, not an OpenAI-compatible generation endpoint.
export class JevProvider {
  constructor({ keyEnv = 'TYPESAFE_API_KEY', apiKey, fetchImpl = fetch } = {}) {
    this.name = 'typesafe';
    this.key = apiKey || environment(keyEnv) || (keyEnv === 'TYPESAFE_API_KEY' ? environment('JEV_API_KEY') : undefined);
    this.fetch = fetchImpl;
    if (!this.key) throw Error(`${keyEnv} (or JEV_API_KEY) not found in process, Windows user, or machine environment`);
    credentials.add(this.key);
  }

  async request(path, body, { signal } = {}) {
    const response = await this.fetch(`https://api.typesafe.ai/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
    });
    // Never include arbitrary server error bodies, which could echo credentials.
    if (!response.ok) throw Error(`TypeSafe ${response.status}: request failed`);
    return response.json();
  }

  async models() {
    const result = await this.request('/models');
    return result.models.map((m) => m.name).sort();
  }

  async respond(payload, options) {
    const response = await this.request('/systemone', payload, options);
    return { ...response, status: response.status || 'completed' };
  }
}

export class OpenAIProvider {
  constructor({ fetchImpl = fetch, requestSignal } = {}) {
    this.name = 'openai';
    this.requestSignal = requestSignal;
    this.key = environment('OPENAI_API_KEY');
    this.fetch = fetchImpl;
    if (!this.key) throw Error('OPENAI_API_KEY not found in process, Windows user, or machine environment');
  }

  async models() {
    const result = await this.request('/models');
    return result.data.map((m) => m.id).sort();
  }

  async countTokens(payload) {
    const body = Object.fromEntries(['model', 'input', 'instructions', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls']
      .filter(k => payload[k] !== undefined).map(k => [k, payload[k]]));
    const response = await this.fetch('https://api.openai.com/v1/responses/input_tokens', {
      method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error(`OpenAI token count ${response.status}`);
    return response.json();
  }

  async request(path, body, { signal, onDelta, onReasoning } = {}) {
    const parent = this.requestSignal ? AbortSignal.any([this.requestSignal, ...(signal ? [signal] : [])]) : signal;
    return withResponseDeadline(this.name, parent, async responseSignal => {
    const response = await this.fetch(`https://api.openai.com/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify({ ...body, ...(onDelta ? { stream: true } : {}) }) } : {}),
      signal: responseSignal,
    });
    if (response.ok && onDelta) {
      let result;
      const items = new Map();
      try {
      await readEvents(response, event => {
        if (['response.output_item.added', 'response.output_item.done'].includes(event.type)) items.set(event.output_index, structuredClone(event.item));
        if (event.type === 'response.reasoning_summary_text.delta') {
          const item = items.get(event.output_index) || { type: 'reasoning', summary: [] };
          items.set(event.output_index, item);
          const part = (item.summary ||= [])[event.summary_index] ||= { type: 'summary_text', text: '' };
          part.text += event.delta;
        }
        if (event.type === 'error') throw Error(redact(event.error?.message || event.message || 'OpenAI stream failed'));
        if (['response.output_text.delta', 'response.refusal.delta'].includes(event.type)) onDelta(event.delta);
        if (event.type === 'response.reasoning_summary_text.delta') onReasoning?.({ delta: event.delta, block: `${event.output_index}:${event.summary_index}` });
        if (['response.completed', 'response.incomplete', 'response.failed'].includes(event.type)) result = event.response;
      });
      if (!result) throw Error('OpenAI response stream ended unexpectedly');
      return result;
      } catch (error) {
        error.partial_response = result || { status: 'partial', output: [...items.values()] };
        throw error;
      }
    }
    const data = await response.json();
    if (!response.ok) throw Error(`OpenAI ${response.status}: ${redact(data.error?.message || 'Request failed')}`);
    return data;
    });
  }

  async respond(payload, options) {
    return this.request('/responses', payload, options);
  }
}

// Keep the engine's tool exchanges provider-neutral at the adapter boundary.
// Anthropic puts tool calls in assistant messages and results in user messages.
export function anthropicPayload(payload) {
  const messages = [];
  const append = (role, content) => {
    if (!content.length) return;
    if (messages.at(-1)?.role === role) messages.at(-1).content.push(...content);
    else messages.push({ role, content });
  };
  for (const item of payload.input || []) {
    if (item.anthropic_content) {
      append('assistant', [item.anthropic_content]);
    } else if (item.type === 'function_call') {
      append('assistant', [{ type: 'tool_use', id: item.call_id, name: item.name, input: JSON.parse(item.arguments) }]);
    } else if (item.type === 'function_call_output') {
      let isError = false;
      try { isError = !!JSON.parse(item.output)?.error; } catch {}
      append('user', [{ type: 'tool_result', tool_use_id: item.call_id, content: item.output, ...(isError ? { is_error: true } : {}) }]);
    } else if (item.role === 'user' || item.role === 'assistant') {
      const content = typeof item.content === 'string' ? [{ type: 'text', text: item.content }] :
        (item.content || []).filter(p => ['text', 'input_text', 'output_text', 'refusal'].includes(p.type))
          .map(p => ({ type: 'text', text: p.text || p.refusal || '' }));
      if (payload.prompt_cache !== false && item.cache_boundary === 'settled' && content.length)
        content.at(-1).cache_control = { type: 'ephemeral' };
      append(item.role, content.filter(p => p.text));
    }
    // OpenAI encrypted reasoning is never sent to Anthropic.
  }
  for (const message of messages) if (message.role === 'user')
    message.content = [...message.content.filter(p => p.type === 'tool_result'), ...message.content.filter(p => p.type !== 'tool_result')];
  return { model: payload.model, system: payload.instructions, messages,
    // Automatic caching follows the growing final cacheable block. The fixed
    // system breakpoint also survives edits to the working context.
    ...(payload.prompt_cache === false ? {} : { cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: payload.instructions, cache_control: { type: 'ephemeral' } }] }),
    ...reasoningSettings('anthropic', payload.model, payload.max_output_tokens, !!payload.reasoning?.summary),
    max_tokens: payload.max_output_tokens,
    ...(['low', 'medium', 'high', 'xhigh', 'max'].includes(payload.reasoning?.effort)
      ? { output_config: { effort: payload.reasoning.effort } } : {}),
    ...(payload.text?.format?.type === 'json_schema' ? {
      output_config: { ...(['low', 'medium', 'high', 'xhigh', 'max'].includes(payload.reasoning?.effort)
        ? { effort: payload.reasoning.effort } : {}), format: { type: 'json_schema', schema: payload.text.format.schema } },
    } :
      payload.tools?.length ? { tools: payload.tools.map(t => t.type === 'web_search_20250305' ? { ...t } : ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}) };
}

export class AnthropicProvider {
  constructor({ apiKey, fetchImpl = fetch, requestSignal } = {}) {
    this.name = 'anthropic';
    this.requestSignal = requestSignal;
    this.key = apiKey || environment('ANTHROPIC_API_KEY');
    this.fetch = fetchImpl;
    if (!this.key) throw Error('ANTHROPIC_API_KEY not found in process, Windows user, or machine environment');
    credentials.add(this.key);
  }

  requestPayload(payload) { return anthropicPayload(payload); }

  async countTokens(payload) {
    const { max_tokens, cache_control, ...body } = this.requestPayload(payload);
    const response = await this.fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST', headers: { 'x-api-key': this.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error(`Anthropic token count ${response.status}`);
    return response.json();
  }

  async respond(payload, { signal, onDelta, onReasoning } = {}) {
    const parent = this.requestSignal ? AbortSignal.any([this.requestSignal, ...(signal ? [signal] : [])]) : signal;
    return withResponseDeadline(this.name, parent, async responseSignal => {
    const response = await this.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': this.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...this.requestPayload(payload), ...(onDelta ? { stream: true } : {}) }),
      signal: responseSignal,
    });
    let data;
    if (response.ok && onDelta) {
      let stopped = false;
      const inputs = new Map();
      try {
      await readEvents(response, event => {
        if (event.type === 'error') throw Error(redact(event.error?.message || 'Anthropic stream failed'));
        if (event.type === 'message_start') data = { ...event.message, content: [...event.message.content] };
        if (event.type === 'content_block_start') data.content[event.index] = { ...event.content_block };
        if (event.type === 'content_block_delta') {
          const block = data.content[event.index], delta = event.delta;
          if (delta.type === 'text_delta') { block.text += delta.text; onDelta(delta.text); }
          if (delta.type === 'thinking_delta') { block.thinking += delta.thinking; onReasoning?.({ delta: delta.thinking, block: String(event.index) }); }
          if (delta.type === 'signature_delta') block.signature = (block.signature || '') + delta.signature;
          if (delta.type === 'input_json_delta') inputs.set(event.index, (inputs.get(event.index) || '') + delta.partial_json);
          if (delta.type === 'citations_delta') (block.citations ||= []).push(delta.citation);
        }
        if (event.type === 'content_block_stop' && inputs.get(event.index)) data.content[event.index].input = JSON.parse(inputs.get(event.index));
        if (event.type === 'message_delta') {
          Object.assign(data, event.delta);
          if (event.input_transformations) data.input_transformations = event.input_transformations;
          if (event.usage) data.usage = { ...data.usage, ...event.usage };
        }
        if (event.type === 'message_stop') stopped = true;
      });
      if (!stopped || !data?.stop_reason) throw Error('Anthropic response stream ended unexpectedly');
      } catch (error) {
        error.partial_response = { id: data?.id, model: data?.model, usage: anthropicUsage(data?.usage), status: 'partial',
          output: (data?.content || []).filter(Boolean).filter(p => ['thinking', 'redacted_thinking'].includes(p.type)).map(p => ({ type: 'reasoning', anthropic_content: p })) };
        throw error;
      }
    } else data = await response.json();
    if (!response.ok) throw Error(`Anthropic ${response.status}: ${redact(data.error?.message || 'Request failed')}`);
    const completed = ['end_turn', 'tool_use', 'stop_sequence'].includes(data.stop_reason);
    // Cache reads/writes are input tokens too; count them toward the run limit.
    const usage = anthropicUsage(data.usage);
    return { id: data.id, model: data.model, status: completed ? 'completed' : 'incomplete', stop_reason: data.stop_reason,
      incomplete_details: completed ? null : { reason: data.stop_reason }, usage,
      input_transformations: data.input_transformations || null,
      native_output: data.content || [],
      output: (data.content || []).flatMap(p => ['thinking', 'redacted_thinking'].includes(p.type) ? [{ type: 'reasoning', anthropic_content: p }] :
        p.type === 'tool_use' ? [{ type: 'function_call', call_id: p.id, name: p.name, arguments: JSON.stringify(p.input), anthropic_content: p }] :
        p.type === 'text' ? [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: p.text }], anthropic_content: p }] : []) };
    });
  }
}

export function taskProvider(provider = 'openai', options) {
  if (provider === 'anthropic') return new AnthropicProvider(options);
  if (provider === 'openai') return new OpenAIProvider(options);
  throw Error('Unsupported task provider');
}

export const responseText = (response) => (response.output || []).flatMap((item) => item.content || [])
  .filter((part) => part.type === 'output_text' || part.type === 'refusal').map((part) => part.text || part.refusal).join('\n');
