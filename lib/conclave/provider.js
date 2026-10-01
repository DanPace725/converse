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

export const responseText = (response) => (response.output || []).flatMap((item) => item.content || [])
  .filter((part) => part.type === 'output_text' || part.type === 'refusal').map((part) => part.text || part.refusal).join('\n');
