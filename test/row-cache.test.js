import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db-schema.js";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import {
  ContextRepository,
  downloadRecord,
} from "../lib/context-repository.js";

const migrations = new URL("../drizzle/", import.meta.url);
async function database() {
  const client = new PGlite({ extensions: { vector } });
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    for (const statement of readFileSync(
      new URL(file, migrations),
      "utf8",
    ).split("--> statement-breakpoint"))
      if (statement.trim()) await client.exec(statement);
  return client;
}
const options = {
  serviceOptions: {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({
      name: "openai",
      respond: async () => ({
        status: "completed",
        id: "fixture_response",
        model: "fixture",
        usage: { input_tokens: 100, output_tokens: 5 },
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Saved." }],
          },
        ],
      }),
    }),
  },
};
const ask = (id, n) => (service) =>
  service.ask(id, {
    message_id: "msg_" + n,
    content: "Turn " + n + " " + "x".repeat(4000),
    settings: { model: "fixture", jev: false },
  });
const comparable = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === "exported_at" ? undefined : item,
    ),
  );

test('direct transcript matches complete messages without rebuilding the engine or transferring request inputs', async t => {
  const client = await database();
  t.after(() => client.close());
  const db = drizzle(client, { schema });
  let metrics;
  const repository = new ContextRepository(db, { ...options, onLoad: m => { metrics = m; } });
  const id = (await repository.create('Transcript')).conversation_id;
  await repository.run(id, true, async service => {
    await service.ask(id, { message_id: 'first', content: 'Hello', settings: { model: 'fixture', jev: false },
      attachments: [{ attachment_id: 'doc_one', name: 'Original.md', mime_type: 'text/plain', content: 'Original source.' }] });
    const request = service.store.events(id).findLast(e => e.kind === 'inference_request');
    service.store.append(id, 'inference_response', 'answer', { request_id: request.id, model: 'reported-model',
      output: [{ type: 'reasoning', id: 'summary', summary: [{ type: 'summary_text', text: 'Visible rationale.' }], encrypted_content: 'opaque-secret' },
        { type: 'reasoning', anthropic_content: { type: 'thinking', thinking: 'Claude rationale.', signature: 'signed-secret' } },
        { type: 'function_call', arguments: 'private tool args' },
        { type: 'message', content: [{ type: 'output_text', text: 'Narration.' }] }], usage: { input_tokens: 7, output_tokens: 3 } });
    service.store.append(id, 'turn_failure', 'Provider unavailable', { user_event_id: service.store.events(id).find(e => e.kind === 'user').id });
    service.store.append(id, 'user', 'Correction', { client_message_id: 'second', revises_message_id: 'first', web_settings: { provider: 'anthropic', model: 'claude-fixture', reasoning: 'default' } }, 'human');
    service.store.append(id, 'inference_response', 'answer', { request_id: request.id, output: null });
    await service.saveDocument(id, { path: 'large.md', content: 'file-text-private '.repeat(5000), expected_source_event_id: null });
  });
  const full = await repository.run(id, false, service => service.view(id));
  repository.service = () => { throw Error('Transcript must not instantiate the engine'); };
  const light = await repository.transcript(id);
  for (const key of ['messages', 'attachments', 'settings', 'title', 'title_generated']) assert.deepEqual(light[key], full[key], key);
  assert.equal(light.context.revision, full.context.revision);
  assert.equal(light.view_kind, 'transcript');
  assert.equal(metrics.hydrate_ms, 0);
  assert.equal(metrics.snapshot_rows, 0);
  assert.equal(light.model_input, undefined);
  assert.deepEqual(light.workspace, full.workspace.map(file => ({ path: file.path, source_event_id: file.source_event_id })));
  assert.ok(metrics.result_bytes < 15000);
  assert.doesNotMatch(JSON.stringify(light), /opaque-secret|signed-secret|private tool args|file-text-private/);
  await assert.rejects(repository.transcript('bad'), { status: 400 });
  await assert.rejects(repository.transcript('conv_missing'), { status: 404 });
  // An uncached reader sees newly appended messages and the authoritative seq.
  const writer = new ContextRepository(db, options);
  await writer.run(id, true, ask(id, 2));
  const next = await repository.transcript(id);
  assert.equal(next.messages.length, light.messages.length + 2);
  assert.ok(next.read_version.seq > light.read_version.seq);
  const record = await writer.run(id, false, service => downloadRecord(service, id));
  assert.match(JSON.stringify(record.context_layer.events), /opaque-secret/);
  assert.deepEqual(next.messages, record.messages);
});

test('transcript reads current Agent checkpoints and attachment removals after a restart', async t => {
  const client = await database(); t.after(() => client.close());
  const db = drizzle(client, { schema });
  const writer = new ContextRepository(db, options);
  const id = (await writer.create('Agent transcript')).conversation_id;
  const started = await writer.run(id, true, service => service.agentStart(id, {
    content: 'Review the attached source.', message_id: 'agent_first', settings: { model: 'fixture', jev: false },
    attachments: [{ attachment_id: 'agent_doc', name: 'source.md', content: 'Saved source.' }],
  }));
  const reader = new ContextRepository(db);
  reader.service = () => { throw Error('No engine for display'); };
  const running = await reader.transcript(id);
  assert.equal(running.agent.status, 'running');
  assert.equal(running.agent.run_id, started.agent.run_id);
  assert.deepEqual(running.agent.limits, started.agent.limits);
  assert.equal(running.agent.pending, undefined);
  assert.equal(running.agent.continuation, undefined);
  assert.equal(running.attachments.length, 1);
  await writer.run(id, true, service => service.agentStop(id, { run_id: running.agent.run_id }));
  await writer.run(id, true, service => service.changeDocument(id, { operation: 'remove',
    source_event_id: running.attachments[0].source_event_id, expected_source_event_id: running.attachments[0].source_event_id,
    expected_revision: service.store.context(id).revision }));
  const stopped = await reader.transcript(id);
  assert.equal(stopped.agent.status, 'stopped');
  assert.equal(stopped.agent.stop.code, 'stopped');
  assert.equal(stopped.attachments.length, 0);
  assert.equal(stopped.busy, false);
  await db.update(schema.conversations).set({ leaseToken: 'fixture', leaseUntil: new Date(Date.now() + 60000).toISOString() });
  assert.equal((await reader.transcript(id)).busy, true);
  await db.update(schema.conversations).set({ leaseUntil: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await reader.transcript(id)).busy, false);
});

// Neon bills query results as network transfer, so warm reads must fetch only new rows.
test("warm reads fetch only new audit rows and match a cold instance", async () => {
  const client = await database();
  let bytes = 0;
  const count =
    (query) =>
    async (...args) => {
      const result = await query(...args);
      bytes += JSON.stringify(result.rows ?? []).length;
      return result;
    };
  client.query = count(client.query.bind(client));
  const transaction = client.transaction.bind(client);
  client.transaction = (callback) =>
    transaction((tx) => {
      tx.query = count(tx.query.bind(tx));
      return callback(tx);
    });
  const db = drizzle(client, { schema });
  // A separate module instance has an empty cache, like a cold function.
  const cold = async (id, action) => {
    const fresh = await import("../lib/conclave/context-repository.js?cold=" + bytes);
    return new fresh.ContextRepository(db, options).run(id, false, action);
  };
  const repository = new ContextRepository(db, options);
  const { conversation_id: id } = await repository.create("Row cache");
  for (let n = 0; n < 4; n++) await repository.run(id, true, ask(id, n));

  bytes = 0;
  const coldView = await cold(id, (service) => service.view(id));
  const coldBytes = bytes;
  await repository.run(id, false, (service) => service.view(id));
  bytes = 0;
  const warmView = await repository.run(id, false, (service) =>
    service.view(id),
  );
  assert.ok(bytes < 1000, `warm poll transferred ${bytes} bytes`);
  assert.ok(coldBytes > 50 * bytes);
  assert.deepEqual(comparable(warmView), comparable(coldView));
  assert.deepEqual(
    comparable(await repository.run(id, false, (s) => s.activity(id))),
    comparable(await cold(id, (s) => s.activity(id))),
  );

  // Rows written after caching arrive as deltas and later mutations stay consistent.
  await repository.run(id, true, ask(id, 4));
  await repository.run(id, true, (service) =>
    service.remember(id, {
      key: "goal",
      type: "objective",
      content: "Keep originals.",
    }),
  );
  await repository.run(id, true, ask(id, 5));
  const warm = await repository.run(id, false, (s) => downloadRecord(s, id));
  assert.equal(warm.messages.length, 12);
  assert.deepEqual(
    comparable(warm),
    comparable(await cold(id, (s) => downloadRecord(s, id))),
  );

  // Each distinct segment is stored once; snapshots only list hashes.
  const stored = await client.query(
    "SELECT (SELECT count(*)::int FROM conclave.segments) AS segments, sum(cardinality(segment_hashes))::int AS refs FROM conclave.snapshots",
  );
  const { segments, refs } = stored.rows[0];
  assert.equal(
    (
      await client.query(
        "SELECT 1 FROM conclave.snapshots WHERE segments IS NOT NULL",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    warm.context_layer.snapshots.length,
    warm.context_layer.context.revision,
  );
  assert.ok(refs > 3 * segments, `${refs} references to ${segments} segments`);
  await assert.rejects(
    client.query("DELETE FROM conclave.segments"),
    /append-only/,
  );
  await client.close();
});

test("conversations saved with full snapshot rows keep loading and continue with hashed rows", async () => {
  const client = await database();
  const db = drizzle(client, { schema });
  // Build a conversation the way earlier deployments stored it.
  const engine = new Store(undefined, { memory: true });
  const service = new ConclaveService(engine, options.serviceOptions);
  const { conversation_id: id, created_at, title } = service.create("Legacy");
  for (let n = 0; n < 2; n++) await ask(id, n)(service);
  const history = engine.events(id);
  const legacy = engine.db
    .prepare(
      "SELECT revision,receipt_id,segments FROM snapshots WHERE conversation_id=? ORDER BY revision",
    )
    .all(id);
  await db.insert(schema.conversations).values({
    id,
    title,
    createdAt: created_at,
    lastSeq: history.at(-1).seq,
    revision: legacy.at(-1).revision,
  });
  await db.insert(schema.events).values(
    history.map((event) => ({
      id: event.id,
      conversationId: id,
      seq: event.seq,
      data: event,
    })),
  );
  await db.insert(schema.snapshots).values(
    legacy.map((row) => ({
      conversationId: id,
      revision: row.revision,
      receiptId: row.receipt_id,
      segments: JSON.parse(row.segments),
    })),
  );
  engine.close();

  const repository = new ContextRepository(db, options);
  await repository.run(id, true, ask(id, 2));
  const fresh = await import("../lib/conclave/context-repository.js?legacy");
  const record = await new fresh.ContextRepository(db, options).run(
    id,
    false,
    (s) => downloadRecord(s, id),
  );
  assert.equal(record.messages.length, 6);
  assert.deepEqual((await repository.transcript(id)).messages, record.messages);
  assert.equal(
    record.context_layer.snapshots.length,
    record.context_layer.context.revision,
  );
  for (const row of legacy)
    assert.deepEqual(
      comparable(
        record.context_layer.snapshots.find((s) => s.revision === row.revision)
          .segments,
      ),
      comparable(JSON.parse(row.segments)),
    );
  const forms = await client.query(
    "SELECT count(segments)::int AS full_rows, count(segment_hashes)::int AS hashed_rows FROM conclave.snapshots",
  );
  assert.equal(forms.rows[0].full_rows, legacy.length);
  assert.ok(forms.rows[0].hashed_rows > 0);
  await client.close();
});
