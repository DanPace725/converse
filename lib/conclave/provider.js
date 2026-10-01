import { execFileSync } from 'node:child_process';
const credentials = new Set();

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

  async respond(payload, options) { return this.request('/systemone', payload, options); }
}

export class OpenAIProvider {
  constructor({ fetchImpl = fetch } = {}) {
    this.name = 'openai';
    this.key = environment('OPENAI_API_KEY');
    this.fetch = fetchImpl;
    if (!this.key) throw Error('OPENAI_API_KEY not found in process, Windows user, or machine environment');
  }

  async models() {
    const result = await this.request('/models');
    return result.data.map((m) => m.id).sort();
  }

  async request(path, body, { signal } = {}) {
    const response = await this.fetch(`https://api.openai.com/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]),
    });
    const data = await response.json();
    if (!response.ok) throw Error(`OpenAI ${response.status}: ${redact(data.error?.message || 'Request failed')}`);
    return data;
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
    if (item.type === 'reasoning' && item.anthropic_content) {
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
      append(item.role, content.filter(p => p.text));
    }
    // OpenAI encrypted reasoning is never sent to Anthropic.
  }
  for (const message of messages) if (message.role === 'user')
    message.content = [...message.content.filter(p => p.type === 'tool_result'), ...message.content.filter(p => p.type !== 'tool_result')];
  return { model: payload.model, system: payload.instructions, messages,
    max_tokens: payload.max_output_tokens,
    ...(payload.text?.format?.type === 'json_schema' ? {
      output_config: { format: { type: 'json_schema', schema: payload.text.format.schema } },
    } :
      payload.tools?.length ? { tools: payload.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}) };
}

export class AnthropicProvider {
  constructor({ apiKey, fetchImpl = fetch } = {}) {
    this.name = 'anthropic';
    this.key = apiKey || environment('ANTHROPIC_API_KEY');
    this.fetch = fetchImpl;
    if (!this.key) throw Error('ANTHROPIC_API_KEY not found in process, Windows user, or machine environment');
    credentials.add(this.key);
  }

  requestPayload(payload) { return anthropicPayload(payload); }

  async respond(payload, { signal } = {}) {
    const response = await this.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': this.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify(this.requestPayload(payload)),
      signal: AbortSignal.any([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]),
    });
    const data = await response.json();
    if (!response.ok) throw Error(`Anthropic ${response.status}: ${redact(data.error?.message || 'Request failed')}`);
    const completed = ['end_turn', 'tool_use', 'stop_sequence'].includes(data.stop_reason);
    const usage = data.usage ? { ...data.usage,
      // Cache reads/writes are input tokens too; count them toward the run limit.
      input_tokens: Number.isSafeInteger(data.usage.input_tokens) ? data.usage.input_tokens +
        (data.usage.cache_read_input_tokens || 0) + (data.usage.cache_creation_input_tokens || 0) : null,
    } : null;
    return { id: data.id, model: data.model, status: completed ? 'completed' : 'incomplete', stop_reason: data.stop_reason,
      incomplete_details: completed ? null : { reason: data.stop_reason }, usage,
      output: (data.content || []).flatMap(p => ['thinking', 'redacted_thinking'].includes(p.type) ? [{ type: 'reasoning', anthropic_content: p }] :
        p.type === 'tool_use' ? [{ type: 'function_call', call_id: p.id, name: p.name, arguments: JSON.stringify(p.input) }] :
        p.type === 'text' ? [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: p.text }] }] : []) };
  }
}

export function taskProvider(provider = 'openai', options) {
  if (provider === 'anthropic') return new AnthropicProvider(options);
  if (provider === 'openai') return new OpenAIProvider(options);
  throw Error('Unsupported task provider');
}

export const responseText = (response) => (response.output || []).flatMap((item) => item.content || [])
  .filter((part) => part.type === 'output_text' || part.type === 'refusal').map((part) => part.text || part.refusal).join('\n');
