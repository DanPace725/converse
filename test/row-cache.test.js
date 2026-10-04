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
    const fresh = await import("../lib/context-repository.js?cold=" + bytes);
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
  const fresh = await import("../lib/context-repository.js?legacy");
  const record = await new fresh.ContextRepository(db, options).run(
    id,
    false,
    (s) => downloadRecord(s, id),
  );
  assert.equal(record.messages.length, 6);
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
