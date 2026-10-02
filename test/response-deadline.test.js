import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESPONSE_TIMEOUT_MS, HOSTED_REQUEST_TIMEOUT_MS, withResponseDeadline } from '../lib/conclave/response-deadline.js';
import { OpenAIProvider, AnthropicProvider } from '../lib/conclave/provider.js';
import { Store } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { createContextHandler } from '../lib/conclave-http.js';
import { session } from '../lib/access.js';

test('response allowance leaves checkpoint time within hosted and platform deadlines', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  assert.equal(RESPONSE_TIMEOUT_MS, 180000);
  assert.ok(HOSTED_REQUEST_TIMEOUT_MS - RESPONSE_TIMEOUT_MS >= 20000);
  assert.ok(config.functions['api/*.js'].maxDuration * 1000 - HOSTED_REQUEST_TIMEOUT_MS >= 20000);
});

for (const provider of ['openai', 'anthropic']) test(`${provider} response timeout keeps partial diagnostics and identifies its own limit`, async () => {
  const partial = { status: 'partial', output: [{ type: 'reasoning' }] };
  await assert.rejects(() => withResponseDeadline(provider, null, signal => new Promise((resolve, reject) => {
    // Keep the simulated stream open; AbortSignal.timeout itself is unref'ed.
    const active = setInterval(() => {}, 100);
    signal.addEventListener('abort', () => {
      clearInterval(active);
      reject(Object.assign(Error('Stream aborted'), { partial_response: partial }));
    }, { once: true });
  }), 10), error => {
    assert.equal(error.agent_detail.code, 'provider_response_timeout');
    assert.equal(error.agent_detail.provider, provider);
    assert.equal(error.agent_detail.timeout_ms, 10);
    assert.equal(error.partial_response, partial);
    return true;
  });
});

test('an earlier caller cancellation preserves its reason instead of blaming the response allowance', async () => {
  const parent = new AbortController(), original = Error('Run stopped');
  parent.abort(original);
  await assert.rejects(() => withResponseDeadline('openai', parent.signal, async signal => {
    signal.throwIfAborted();
  }, 100), error => error === original && !error.agent_detail);
});

test('HTTP keeps typed response timeouts visible even with an AbortError cause, while masking database errors', async () => {
  const passwordBefore = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = 'deadline-http-fixture';
  try {
    for (const stream of [false, true]) for (const timeout of [true, false]) {
      const error = timeout ? Object.assign(Error('GPT response timed out after 180 seconds'), {
        agent_detail: { code: 'provider_response_timeout' }, cause: new DOMException('Stream aborted', 'AbortError'),
      }) : Object.assign(Error('private database detail'), { code: '57P01' });
      const handler = createContextHandler({ ask: async () => { throw error; } });
      let text = '', status;
      const res = { writeHead(value) { status = value; }, write(value) { text += value; }, end(value = '') { text += value; } };
      await handler({ method: 'POST', url: '/api/conclave', headers: {
        host: 'localhost', 'content-type': 'application/json', cookie: 'converse_session=' + session(),
      }, body: { action: 'ask', conversation_id: 'conv_fixture', stream } }, res);
      assert.equal(status, stream ? 200 : timeout ? 400 : 503);
      assert.match(text, timeout ? /GPT response timed out after 180 seconds/ : /Context storage unavailable/);
      assert.doesNotMatch(text, /private database detail/);
    }
  } finally {
    if (passwordBefore === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = passwordBefore;
  }
});

for (const name of ['openai', 'anthropic']) test(`${name} hosted streaming deadline remains distinct and incomplete writes never execute`, async () => {
  const store = new Store(undefined, { memory: true }), parent = new AbortController();
  const keyBefore = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'deadline-fixture';
  const fetchImpl = async (_url, options) => {
    const body = new ReadableStream({ start(stream) {
      const event = name === 'openai'
        ? { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', name: 'workspace_write', call_id: 'unfinished', arguments: '', status: 'in_progress' } }
        : { type: 'message_start', message: { content: [], model: 'claude-fixture' } };
      stream.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
      const timer = setTimeout(() => parent.abort(Object.assign(Error('Hosted request limit reached'), {
        name: 'TimeoutError', agent_detail: { code: 'hosted_request_timeout', timeout_ms: 200000 },
      })), 10);
      options.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        stream.error(new DOMException('Body stream aborted', 'AbortError'));
      }, { once: true });
    } });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const provider = name === 'openai' ? new OpenAIProvider({ fetchImpl, requestSignal: parent.signal })
      : new AnthropicProvider({ apiKey: 'fixture', fetchImpl, requestSignal: parent.signal });
    const service = new ConclaveService(store, {
      providerFactory: () => provider, availability: () => ({ openai: true, anthropic: true, jev: false }),
    });
    const id = service.create().conversation_id;
    let view = await service.agentStart(id, { message_id: 'deadline', content: 'Write a report.', settings: {
      provider: name, model: name === 'openai' ? 'fixture' : 'claude-fixture', jev: false,
    } });
    view = await service.agentStep(id, { run_id: view.agent.run_id, expected_step: 0 }, { onEvent() {} });
    assert.equal(view.agent.status, 'failed');
    assert.equal(view.agent.stop.code, 'hosted_request_timeout');
    assert.equal(view.agent.stop.timeout_ms, 200000);
    assert.match(view.messages[0].failure, /Hosted request limit reached/);
    assert.equal(view.workspace.length, 0);
    assert.equal(store.events(id).filter(e => e.kind === 'tool_call').length, 0);
    assert.equal(store.events(id).find(e => e.kind === 'inference_failure').metadata.detail.code, 'hosted_request_timeout');
    assert.equal(view.agent.usage_complete, false);
    assert.equal(view.agent.metrics.calls, 1);
  } finally {
    store.close();
    if (keyBefore === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = keyBefore;
  }
});
