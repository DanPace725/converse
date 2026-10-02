import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { createConclaveHandler } from "../lib/conclave-local.js";
import { downloadRecord } from "../lib/context-repository.js";
import { session } from "../lib/access.js";

function fixture(t) {
  const store = new Store(undefined, { memory: true });
  t.after(() => store.close());
  const service = new ConclaveService(store, {
    availability: () => ({}),
    providerFactory: () => {
      throw Error("Uploads must not infer");
    },
  });
  return { store, service, id: service.create().conversation_id };
}

test("direct uploads preserve full human sources without turns, inference or working-context excerpts; retrieval and edits use versioned files", async (t) => {
  const { store, service, id } = fixture(t);
  service.harness(id).pin("Keep this context unchanged.");
  const before = store.context(id);
  const messagesBefore = service.view(id).messages.length;
  const content =
    "# Original\n" + "café 🌱 evidence\n".repeat(900) + "END OF SOURCE";
  const view = await service.uploadDocument(id, {
    name: "Research notes.md",
    content,
  });
  assert.deepEqual(view.context, before);
  assert.equal(view.messages.length, messagesBefore);
  assert.equal(view.attachments.length, 0);
  assert.equal(view.metrics.calls, 0);
  assert.equal(view.workspace[0].path, "Research_notes.md");
  assert.equal(view.workspace[0].content, content);
  const original = store.source(id, view.workspace[0].source_event_id);
  assert.equal(original.actor, "human");
  assert.equal(original.metadata.filename, "Research notes.md");
  assert.equal(original.metadata.workspace_operation, "upload");
  assert.equal(original.metadata.mime_type, "text/markdown");
  const h = new ConclaveService(store).harness(id);
  const payload = h.answerPayload();
  assert.match(JSON.stringify(payload.input), /Research_notes.md/);
  assert.doesNotMatch(JSON.stringify(payload.input), /END OF SOURCE/);
  let readback = "",
    offset = 0;
  do {
    const page = h.toolResult(
      "workspace_read",
      { path: "Research_notes.md", offset },
      [],
    );
    readback += page.content;
    offset = page.next_offset;
  } while (offset !== null);
  assert.equal(readback, content);
  assert.equal(
    downloadRecord(service, id).context_layer.events.find(
      (e) => e.id === original.id,
    ).content,
    content,
  );
  await service.saveDocument(id, {
    path: "Research_notes.md",
    content: "# Revised\nChanged deliberately.",
    expected_source_event_id: original.id,
  });
  assert.equal(store.source(id, original.id).content, content);
  assert.equal(
    service.workspaceFile(id, "Research_notes.md").previous_source_event_id,
    original.id,
  );
});

test("upload rejects duplicate names, unsupported/binary documents and oversized UTF-8 text without changing saved files", async (t) => {
  const { store, service, id } = fixture(t);
  await service.uploadDocument(id, { name: "notes.md", content: "Original" });
  const count = store.events(id).length;
  for (const input of [
    { name: "../notes.md", content: "Escape" },
    { name: "document.pdf", content: "%PDF" },
    { name: ".md", content: "No basename" },
    { name: "binary.txt", content: "bad\u0000data" },
    { name: "big.txt", content: "x".repeat(100001) },
    { name: "big.md", content: "🌱".repeat(25001) },
  ])
    await assert.rejects(service.uploadDocument(id, input), { status: 400 });
  await assert.rejects(
    service.uploadDocument(id, { name: "notes.md", content: "Replacement" }),
    { status: 409 },
  );
  assert.equal(store.events(id).length, count);
  assert.equal(service.workspaceFile(id, "notes.md").content, "Original");
});

test("direct uploads share workspace total-byte and file-count limits", async (t) => {
  const { service, id } = fixture(t);
  for (let n = 0; n < 5; n++)
    await service.uploadDocument(id, {
      name: `large-${n}.txt`,
      content: "x".repeat(100000),
    });
  await assert.rejects(
    service.uploadDocument(id, { name: "extra.txt", content: "x" }),
    /500 KB/,
  );
  const other = service.create().conversation_id;
  for (let n = 0; n < 20; n++)
    await service.uploadDocument(other, {
      name: `small-${n}.txt`,
      content: "x",
    });
  await assert.rejects(
    service.uploadDocument(other, { name: "extra.txt", content: "x" }),
    /20 files/,
  );
});

test("upload HTTP requires a session and blocks writes while an agent is running", async (t) => {
  const { service, id } = fixture(t);
  const previous = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = "upload-test-password";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = previous;
  });
  const handler = await createConclaveHandler({ service });
  const invoke = async (cookie) => {
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(text) {
        this.data = JSON.parse(text);
      },
    };
    await handler(
      {
        method: "POST",
        url: "/api/conclave",
        headers: { cookie, "content-type": "application/json" },
        body: {
          action: "document_upload",
          conversation_id: id,
          name: "http.md",
          content: "HTTP source",
        },
      },
      res,
    );
    return res;
  };
  assert.equal((await invoke("")).status, 401);
  assert.equal((await invoke("converse_session=" + session())).status, 200);
  await service.agentStart(id, {
    message_id: "objective",
    content: "Work later.",
    settings: { model: "fixture" },
  });
  const res = await invoke("converse_session=" + session());
  assert.equal(res.status, 409);
  assert.match(res.data.error, /Stop the agent/);
  assert.equal(service.workspaceFile(id, "http.md").content, "HTTP source");
});
