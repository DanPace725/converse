import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { getDatabase } from "../lib/database.js";
import {
  ContextRepository,
  downloadRecord,
} from "../lib/context-repository.js";
import { events, snapshots, conversations } from "../lib/db-schema.js";

test(
  "Neon survives fresh instances, publishes progress, fences overlapping turns and keeps complete exports",
  {
    skip:
      !process.env.DATABASE_URL ||
      process.env.NEON_BRANCH !== "converse-hosting-check",
  },
  async () => {
    const { db, pool } = getDatabase();
    let calls = 0,
      started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    let finish;
    const wait = new Promise((resolve) => {
      finish = resolve;
    });
    const options = {
      serviceOptions: {
        availability: () => ({ openai: true, jev: false }),
        providerFactory: () => ({
          name: "openai",
          respond: async () => {
            calls++;
            started();
            await wait;
            return {
              status: "completed",
              id: "fixture_response",
              model: "fixture",
              usage: { input_tokens: 100, output_tokens: 5 },
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "Saved in Neon." }],
                },
              ],
            };
          },
        }),
      },
    };
    try {
      const writer = new ContextRepository(db, options);
      const { conversation_id: id } = await writer.create(
        "Disposable hosting check",
      );
      const input = {
        message_id: "msg_neon_fixture",
        content: "Remember café 🌱.",
        settings: { model: "fixture", jev: false },
      };
      const pending = writer.run(id, true, (service) => service.ask(id, input));
      // Observe the already persisted request while inference is still in flight.
      await ready;
      const reader = new ContextRepository(db, options);
      const activity = await reader.run(id, false, (service) =>
        service.activity(id),
      );
      assert.equal(activity.busy, true);
      assert.equal(activity.history.count, 1);
      assert.equal(activity.latest.kind, "inference_request");
      try {
        await assert.rejects(
          reader.run(id, true, (service) => service.ask(id, input)),
          { status: 409 },
        );
      } finally {
        finish();
      }
      const view = await pending;
      assert.equal(view.messages[1].content, "Saved in Neon.");
      await reader.run(id, true, (service) => service.ask(id, input));
      assert.equal(
        calls,
        1,
        "a completed retry must not incur inference again",
      );
      await assert.rejects(
        reader.run(id, true, (service) =>
          service.ask(id, { ...input, content: "Changed request" }),
        ),
        { status: 409 },
      );
      await reader.run(id, true, (service) =>
        service.remember(id, {
          key: "goal",
          type: "objective",
          content: "Keep all originals.",
        }),
      );
      const record = await new ContextRepository(db, options).run(
        id,
        false,
        (service) => downloadRecord(service, id),
      );
      assert.equal(record.messages.length, 2);
      assert.equal(record.messages[1].reply_to, input.message_id);
      assert.equal(
        record.context_layer.snapshots.length,
        record.context_layer.context.revision,
      );
      assert.equal(record.context_layer.metrics.input_tokens, 100);
      assert.ok(
        record.context_layer.events.some(
          (event) => event.content === "Remember café 🌱.",
        ),
      );
      assert.equal(
        (
          await reader.run(id, false, (service) =>
            service.activity(id, { replay: true }),
          )
        ).busy,
        false,
      );
      const immutable = (error) =>
        /append-only/.test(error.cause?.message || error.message);
      await assert.rejects(
        db.delete(events).where(eq(events.conversationId, id)),
        immutable,
      );
      await assert.rejects(
        db
          .update(snapshots)
          .set({ segments: [] })
          .where(eq(snapshots.conversationId, id)),
        immutable,
      );
      const [row] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id));
      assert.equal(row.leaseToken, null);
    } finally {
      finish();
      await pool.end();
    }
  },
);
