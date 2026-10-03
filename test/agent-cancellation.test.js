import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../lib/conclave/db-schema.js';
import { Store } from '../lib/conclave/store.js';
import { ConclaveService } from '../lib/conclave/service.js';
import { createContextHandler } from '../lib/conclave/http.js';
import { createHostedHandler } from '../lib/conclave/hosted.js';
import { agentState } from '../lib/conclave/agent.js';
import { EventEmitter } from 'node:events';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const waitForAbort = signal => new Promise((_, reject) => {
  signal.throwIfAborted();
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});
const reply = output => ({ status: 'completed', model: 'fixture', usage: { input_tokens: 10, output_tokens: 5 }, output });
const call = (name, args, id) => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id });
const start = provider => ({ message_id: 'objective', content: 'Write a report.', settings: { provider, model: provider === 'anthropic' ? 'claude-fixture' : 'fixture', jev: false } });

for (const provider of ['openai', 'anthropic']) test(`${provider}: Stop aborts the active response without saving partial text or starting another call`, async () => {
  const store = new Store(undefined, { memory: true });
  const entered = deferred();
  let calls = 0, activeSignal;
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, anthropic: true, jev: false }),
    providerFactory: () => ({ name: provider, respond: async (_payload, { signal, onDelta }) => {
      calls++; activeSignal = signal; onDelta('Unfinished answer'); entered.resolve();
      return waitForAbort(signal);
    } }),
  });
  try {
    const id = service.create().conversation_id;
    const { agent } = await service.agentStart(id, start(provider));
    const pending = service.agentStep(id, { run_id: agent.run_id, expected_step: 0 }, { onEvent() {} });
    await entered.promise;
    const stopped = await service.agentStop(id, { run_id: agent.run_id });
    await pending;
    assert.equal(activeSignal.aborted, true);
    assert.equal(stopped.agent.status, 'stopped');
    assert.equal(stopped.agent.steps, 0);
    assert.equal(stopped.busy, false);
    assert.equal(stopped.messages.filter(m => m.role === 'assistant').length, 0);
    assert.equal(store.events(id).some(e => ['tool_call', 'turn_complete', 'turn_failure'].includes(e.kind)), false);
    assert.deepEqual(agentState(store, id).pending, []);
    assert.equal(agentState(store, id).continuation, null);
    await service.agentStep(id, { run_id: agent.run_id, expected_step: 0 });
    assert.equal(calls, 1);
  } finally { store.close(); }
});

test('Stop during page retrieval preserves completed writes and skips the rest of a tool batch', async () => {
  const store = new Store(undefined, { memory: true });
  const entered = deferred();
  let pageSignal, calls = 0;
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({ name: 'openai', respond: async () => { calls++; return reply([
      call('workspace_write', { path: 'saved.md', content: '# Saved\nCompleted before Stop.' }, 'before'),
      call('web_fetch', { url: 'https://example.com/report' }, 'fetch'),
      call('workspace_write', { path: 'late.md', content: '# Late\nMust not execute.' }, 'after'),
    ]); } }),
    pageFetcher: async (_url, { signal }) => { pageSignal = signal; entered.resolve(); return waitForAbort(signal); },
  });
  try {
    const id = service.create().conversation_id;
    const { agent } = await service.agentStart(id, start('openai'));
    const pending = service.agentStep(id, { run_id: agent.run_id, expected_step: 0 });
    await entered.promise;
    const stopped = await service.agentStop(id, { run_id: agent.run_id });
    await pending;
    assert.equal(pageSignal.aborted, true);
    assert.equal(stopped.agent.status, 'stopped');
    assert.equal(service.workspaceFile(id, 'saved.md').content, '# Saved\nCompleted before Stop.');
    assert.throws(() => service.workspaceFile(id, 'late.md'), /not found/);
    assert.equal(store.events(id).some(e => e.kind === 'tool_call' && e.metadata.call_id === 'after'), false);
    assert.equal(calls, 1);
  } finally { store.close(); }
});

test('a cancelled step never spends a model call, and a late response cannot complete a stopped turn', async () => {
  const store = new Store(undefined, { memory: true });
  const entered = deferred(), release = deferred();
  let calls = 0;
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({ name: 'openai', respond: async () => {
      calls++; entered.resolve(); await release.promise;
      return reply([{ type: 'message', content: [{ type: 'output_text', text: 'Late answer' }] }]);
    } }),
  });
  try {
    const id = service.create().conversation_id;
    const { agent } = await service.agentStart(id, start('openai'));
    const controller = new AbortController(); controller.abort();
    await service.agentStep(id, { run_id: agent.run_id, expected_step: 0 }, { signal: controller.signal });
    assert.equal(calls, 0);
    assert.equal(service.view(id).agent.status, 'stopped');
    const next = await service.agentStart(id, { ...start('openai'), message_id: 'next_objective' });
    const late = new AbortController();
    const pending = service.agentStep(id, { run_id: next.agent.run_id, expected_step: 0 }, { signal: late.signal });
    await entered.promise; late.abort(); release.resolve(); await pending;
    assert.equal(service.view(id).agent.status, 'stopped');
    assert.equal(service.view(id).messages.some(m => m.role === 'assistant'), false);
    assert.equal(store.events(id).some(e => e.kind === 'turn_complete'), false);
    assert.equal(service.view(id).agent.input_tokens, 10);
  } finally { release.resolve(); store.close(); }
});

for (const transport of ['request signal', 'request error']) test(`${transport}: Vercel cancellation stops an Agent response`, async () => {
  const store = new Store(undefined, { memory: true });
  const entered = deferred();
  let activeSignal;
  const previous = process.env.APP_PASSWORD; delete process.env.APP_PASSWORD;
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({ name: 'openai', respond: async (_payload, { signal }) => {
      activeSignal = signal; entered.resolve(); return waitForAbort(signal);
    } }),
  });
  try {
    const id = service.create().conversation_id;
    const { agent } = await service.agentStart(id, start('openai'));
    const req = new EventEmitter(), res = new EventEmitter(), controller = new AbortController();
    Object.assign(req, { method: 'POST', url: '/api/conclave', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: { action: 'agent_step', stream: true, conversation_id: id, run_id: agent.run_id, expected_step: 0 } });
    Object.assign(res, { writeHead() {}, flushHeaders() {}, write() {}, end() { this.writableEnded = true; } });
    const pending = createContextHandler(service)(req, res);
    await entered.promise;
    if (transport === 'request signal') controller.abort(); else req.emit('error', Error('aborted'));
    await pending;
    assert.equal(activeSignal.aborted, true);
    assert.equal(service.view(id).agent.status, 'stopped');
    assert.equal(service.view(id).messages.some(m => m.role === 'assistant'), false);
    assert.equal(req.listenerCount('error'), 0);
  } finally {
    store.close();
    if (previous === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = previous;
  }
});

for (const hosted of [false, true]) test(`${hosted ? 'hosted PostgreSQL' : 'local'} HTTP: aborting the stream stops the provider and saves a terminal checkpoint`, { timeout: 20000 }, async () => {
  const store = new Store(undefined, { memory: true });
  const entered = deferred(), aborted = deferred();
  let calls = 0, client, server, activeSignal;
  const previousPassword = process.env.APP_PASSWORD;
  delete process.env.APP_PASSWORD;
  const serviceOptions = {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({ name: 'openai', respond: async (_payload, { signal, onDelta }) => {
      calls++; activeSignal = signal; onDelta('Unfinished answer'); entered.resolve();
      signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      return waitForAbort(signal);
    } }),
  };
  try {
    let handler;
    const lifetimes = [];
    if (hosted) {
      client = new PGlite();
      const directory = new URL('../drizzle/', import.meta.url);
      for (const file of readdirSync(directory).filter(n => n.endsWith('.sql')).sort())
        for (const statement of readFileSync(new URL(file, directory), 'utf8').split('--> statement-breakpoint'))
          if (statement.trim()) await client.exec(statement);
      const db = drizzle(client, { schema });
      handler = createHostedHandler({ database: () => db, serviceOptions, waitUntil: promise => lifetimes.push(promise) });
    } else handler = createContextHandler(new ConclaveService(store, serviceOptions));
    server = createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/conclave`;
    const post = (body, signal) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    const created = await (await post({ action: 'create' })).json();
    const id = created.conversation_id;
    const { agent } = await (await post({ action: 'agent_start', conversation_id: id, ...start('openai') })).json();
    const controller = new AbortController();
    const response = await post({ action: 'agent_step', stream: true, conversation_id: id, run_id: agent.run_id, expected_step: 0 }, controller.signal);
    const reader = response.body.getReader();
    await entered.promise;
    await reader.read();
    const keptStep = lifetimes.at(-1);
    if (hosted) assert.ok(keptStep instanceof Promise);
    controller.abort();
    await aborted.promise;
    await keptStep;
    assert.equal(activeSignal.aborted, true);
    let view;
    for (let attempt = 0; attempt < 100; attempt++) {
      view = await (await fetch(`${url}?action=view&conversation=${id}`)).json();
      if (!view.busy && view.agent.status === 'stopped') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(view.agent.status, 'stopped');
    assert.equal(view.busy, false);
    assert.equal(view.agent.steps, 0);
    assert.equal(view.messages.some(m => m.role === 'assistant'), false);
    await post({ action: 'agent_step', conversation_id: id, run_id: agent.run_id, expected_step: 0 });
    assert.equal(calls, 1);
    await reader.cancel().catch(() => {});
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await client?.close(); store.close();
    if (previousPassword === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = previousPassword;
  }
});
