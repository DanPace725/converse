import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { createConclaveHandler } from "../lib/conclave-local.js";

function fixture() {
  const store = new Store(undefined, { memory: true });
  const service = new ConclaveService(store, {
    availability: () => ({}),
    providerFactory: () => {
      throw Error("Manual edits must not infer");
    },
  });
  const id = service.create().conversation_id;
  return { store, service, id };
}

test("manual document saves preserve originals and previous versions, use human attribution and reject stale edits", async () => {
  const { store, service, id } = fixture();
  try {
    const h = service.harness(id);
    const original = h.ingestText("source.md", "# Original\nSource text.", "", {
      attachment_id: "uploaded",
    });
    let view = await service.saveDocument(id, {
      path: "source.md",
      content: "# Edited\nHuman text.",
      expected_source_event_id: null,
      copied_from_source_event_id: original.id,
    });
    const version = view.workspace[0].source_event_id;
    assert.equal(store.event(id, version).actor, "human");
    assert.equal(
      store.event(id, version).metadata.copied_from_source_event_id,
      original.id,
    );
    assert.equal(
      store.event(id, original.id).content,
      "# Original\nSource text.",
    );
    view = await service.saveDocument(id, {
      path: "source.md",
      content: "Intentional removal of heading",
      expected_source_event_id: version,
    });
    assert.equal(view.workspace[0].content, "Intentional removal of heading");
    assert.equal(
      store.event(id, view.workspace[0].source_event_id).metadata
        .previous_source_event_id,
      version,
    );
    const count = store.events(id).length;
    await assert.rejects(
      () =>
        service.saveDocument(id, {
          path: "source.md",
          content: "Stale",
          expected_source_event_id: version,
        }),
      { status: 409 },
    );
    await assert.rejects(
      () =>
        service.saveDocument(id, {
          path: "../escape.md",
          content: "Invalid",
          expected_source_event_id: null,
        }),
      /relative workspace path/,
    );
    await assert.rejects(
      () =>
        service.saveDocument(id, {
          path: "big.md",
          content: "x".repeat(100001),
          expected_source_event_id: null,
        }),
      /100 KB/,
    );
    assert.equal(store.events(id).length, count);
    assert.equal(view.messages.length, 0);
    assert.equal(view.metrics.calls, 0);
    assert.equal(
      store.events(id).filter((e) => e.kind === "inference_request").length,
      0,
    );
  } finally {
    store.close();
  }
});

test("context edits keep source links and revision lineage; state edits preserve attribution and protected text", async () => {
  const { store, service, id } = fixture();
  try {
    const h = service.harness(id);
    const { item, event } = h.addMessage("user", "Original constraint.");
    let view = await service.saveContext(id, {
      bundle_id: item.id,
      expected_revision: store.context(id).revision,
      content: "Clarified constraint.",
    });
    const replacement = view.context.segments.find((s) =>
      s.parent_bundle_ids.includes(item.id),
    );
    assert.ok(replacement.source_event_ids.includes(event.id));
    assert.equal(
      store.source(id, replacement.source_event_ids.at(-1)).actor,
      "human",
    );
    assert.equal(
      store.resolveBundle(id, item.id).content,
      "Original constraint.",
    );
    assert.equal(view.messages.length, 1, "Manual edits are not chat turns");
    await assert.rejects(
      () =>
        service.saveContext(id, {
          bundle_id: replacement.id,
          expected_revision: view.context.revision - 1,
          content: "Stale",
        }),
      { status: 409 },
    );
    view = await service.saveState(id, {
      key: "budget",
      type: "constraint",
      content: "100 dollars",
      status: "active",
      expected_revision: view.context.revision,
      expected_bundle_id: null,
    });
    const old = view.state.entries[0];
    view = await service.saveState(id, {
      key: "budget",
      type: "constraint",
      content: "150 dollars",
      status: "unresolved",
      expected_revision: view.context.revision,
      expected_bundle_id: old.id,
    });
    assert.equal(view.state.entries[0].content, "150 dollars");
    assert.ok(view.state.entries[0].relations.supersedes.includes(old.id));
    assert.ok(
      view.state.entries[0].attribution.every((a) => a.actor === "human"),
    );
    const count = store.events(id).length;
    await assert.rejects(
      () =>
        service.saveState(id, {
          key: "budget",
          type: "constraint",
          content: "Overwrite",
          status: "active",
          expected_revision: view.context.revision,
          expected_bundle_id: null,
        }),
      { status: 409 },
    );
    assert.equal(store.events(id).length, count);
    h.pin("Keep this exact.");
    const pin = store.context(id).segments.find((s) => s.pinned);
    await assert.rejects(
      () =>
        service.saveContext(id, {
          bundle_id: pin.id,
          expected_revision: store.context(id).revision,
          content: "Changed",
        }),
      { status: 409 },
    );
    await assert.rejects(
      () =>
        service.saveContext(id, {
          bundle_id: view.state.entries[0].id,
          expected_revision: store.context(id).revision,
          content: "Unstructured",
        }),
      { status: 409 },
    );
    const other = service.create().conversation_id;
    assert.throws(() => service.sourceEvent(other, event.id), { status: 404 });
    assert.throws(() => service.contextBundle(other, item.id), { status: 404 });
  } finally {
    store.close();
  }
});

test("manual HTTP operations share storage/access checks and refuse saves during a running agent", async () => {
  const { store, service, id } = fixture();
  const password = process.env.APP_PASSWORD;
  delete process.env.APP_PASSWORD;
  try {
    const handler = await createConclaveHandler({ service });
    const invoke = async (method, url, body) => {
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
          method,
          url,
          body,
          headers: { host: "localhost", "content-type": "application/json" },
        },
        res,
      );
      return res;
    };
    let res = await invoke("POST", "/api/conclave", {
      action: "document_save",
      conversation_id: id,
      path: "http.md",
      content: "Saved",
      expected_source_event_id: null,
    });
    assert.equal(res.status, 200);
    const source = res.data.workspace[0].source_event_id;
    res = await invoke(
      "GET",
      "/api/conclave?action=source_event&conversation=" +
        id +
        "&event=" +
        source,
    );
    assert.equal(res.data.content, "Saved");
    const bundle = store.context(id).segments[0];
    res = await invoke(
      "GET",
      "/api/conclave?action=context_bundle&conversation=" +
        id +
        "&bundle=" +
        bundle.id,
    );
    assert.equal(res.data.id, bundle.id);
    await service.agentStart(id, {
      message_id: "objective",
      content: "Work later.",
      settings: { model: "fixture" },
    });
    res = await invoke("POST", "/api/conclave", {
      action: "document_save",
      conversation_id: id,
      path: "http.md",
      content: "During agent",
      expected_source_event_id: source,
    });
    assert.equal(res.status, 409);
    assert.match(res.data.error, /Stop the agent/);
    assert.equal(service.workspaceFile(id, "http.md").content, "Saved");
  } finally {
    if (password !== undefined) process.env.APP_PASSWORD = password;
    store.close();
  }
});
