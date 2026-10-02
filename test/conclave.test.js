import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConclaveHandler } from "../lib/conclave-local.js";
import { session } from "../lib/access.js";

test("local HTTP chat and JSON download preserve source IDs, usage and all revisions behind the access guard", async (t) => {
  const { Store } = await import("../lib/conclave/store.js");
  const { ConclaveService } = await import("../lib/conclave/service.js");
  process.env.APP_PASSWORD = "fixture-password";
  const directory = mkdtempSync(join(tmpdir(), "converse-conclave-"));
  const store = new Store(directory);
  try {
    const service = new ConclaveService(store, {
      availability: () => ({ openai: true, jev: false }),
      providerFactory: () => ({
        name: "openai",
        respond: async () => ({
          status: "completed",
          model: "fixture",
          id: "resp_fixture",
          usage: { input_tokens: 100, output_tokens: 5 },
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Saved answer." }],
            },
          ],
        }),
      }),
    });
    const handler = await createConclaveHandler({ service });
    const cookie = "converse_session=" + session();
    async function invoke(method, url, body, authenticated = true) {
      const response = {
        writeHead(status, headers) {
          this.status = status;
          this.headers = headers;
        },
        end(value) {
          this.record = JSON.parse(value);
        },
      };
      await handler(
        {
          method,
          url,
          body,
          headers: {
            host: "localhost",
            "content-type": "application/json",
            ...(authenticated ? { cookie } : {}),
          },
        },
        response,
      );
      return response;
    }
    assert.equal(
      (await invoke("GET", "/api/conclave?action=list", undefined, false))
        .status,
      401,
    );
    const created = await invoke("POST", "/api/conclave", {
      action: "create",
      title: "HTTP fixture",
    });
    assert.equal(created.status, 201);
    const id = created.record.conversation_id;
    const answered = await invoke("POST", "/api/conclave", {
      action: "ask",
      conversation_id: id,
      message_id: "msg_http",
      content: "Hello.",
      settings: { model: "fixture", jev: false },
    });
    assert.equal(answered.status, 200);
    const download = await invoke(
      "GET",
      "/api/conclave?action=download&conversation=" + id,
    );
    assert.equal(download.status, 200);
    assert.match(
      download.headers["Content-Disposition"],
      /attachment; filename="conv_.*\.json"/,
    );
    const record = download.record;
    assert.equal(download.headers["Content-Disposition"], `attachment; filename="${id}_${record.exported_at.replace(/[:.]/g, '-')}.json"`);
    assert.equal(record.messages[1].reply_to, record.messages[0].message_id);
    assert.equal(record.messages[1].usage.input_tokens, 100);
    const sources = new Set(
      record.context_layer.events.map((event) => event.id),
    );
    assert.ok(
      record.messages.every((message) => sources.has(message.source_event_id)),
    );
    assert.equal(
      record.context_layer.snapshots.length,
      record.context_layer.context.revision,
    );
    assert.equal(record.context_layer.metrics.input_tokens, 100);
    const garden = await invoke(
      "GET",
      "/api/conclave?action=activity&conversation=" + id + "&replay=1",
    );
    assert.equal(garden.status, 200);
    assert.equal(garden.record.history.count, 2);
    assert.equal(
      garden.record.context.revision,
      record.context_layer.context.revision,
    );
    assert.ok(
      garden.record.history.items.every((item) => sources.has(item.id)),
    );
    assert.equal(
      (
        await invoke(
          "GET",
          "/api/conclave?action=activity&conversation=" + id,
          undefined,
          false,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await invoke(
          "GET",
          "/api/conclave?action=activity&conversation=" + id + "&after=NaN",
        )
      ).status,
      400,
    );
    assert.ok(
      record.context_layer.events.some(
        (event) => event.kind === "inference_request",
      ),
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});
