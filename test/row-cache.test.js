import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db-schema.js";
import {
  ContextRepository,
  downloadRecord,
} from "../lib/context-repository.js";

// Neon bills query results as network transfer, so warm reads must fetch only new rows.
test("warm reads fetch only new audit rows and match a cold instance", async () => {
  const client = new PGlite();
  for (const statement of readFileSync(
    new URL("../drizzle/0000_low_true_believers.sql", import.meta.url),
    "utf8",
  ).split("--> statement-breakpoint"))
    if (statement.trim()) await client.exec(statement);
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
  // A separate module instance has an empty cache, like a cold function.
  const cold = async (id, action) => {
    const fresh = await import("../lib/context-repository.js?cold=" + bytes);
    return new fresh.ContextRepository(db, options).run(id, false, action);
  };
  const comparable = (value) =>
    JSON.parse(
      JSON.stringify(value, (key, item) =>
        key === "exported_at" ? undefined : item,
      ),
    );

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
  await client.close();
});
