import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/conclave/store.js";
import { Harness, budgetUnits } from "../lib/conclave/harness.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { JevDecisionAdapter } from "../lib/conclave/jev.js";
import { agentState } from "../lib/conclave/agent.js";
import { contextAudit } from "../lib/conclave/telemetry.js";

test('automatic semantic rewrites are bounded per turn; explicit compaction can refresh after preflight', async () => {
  const store = new Store(undefined, { memory: true }); let calls = 0;
  try {
    const id = store.create();
    const adapter = { select: async plan => ({ decisions: plan.entries.filter(e => !e.protected)
      .map(e => ({ bundle_id: e.bundle_id, action: 'compact', priority: 3, reason: 'Repeated constraint.' })) }) };
    const provider = { name: 'openai', respond: async payload => {
      calls++;
      const selected = JSON.parse(payload.input[0].content.split('\n').at(-1));
      return { ...final, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ additions: [{
        type: 'constraint', status: 'unresolved', content: 'Limit: 12 people. The assistant estimate is unverified; retain the caveat.',
        source_event_ids: [...new Set(selected.flatMap(s => s.source_event_ids))],
      }] }) }] }] };
    } };
    const h = new Harness(store, id, provider, { budget: 256000, recent: 2, decisionAdapter: adapter });
    for (let n = 0; n < 5; n++) h.addMessage('assistant', 'Limit: 12 people; assistant estimate unverified. '.repeat(120), { type: 'constraint', status: 'unresolved' });
    h.addMessage('user', 'Preserve the limit and caveat.');
    const first = await h.compact([], false, 0, true);
    assert.equal(first.selection_outcome, 'applied'); assert.equal(calls, 1);
    for (let n = 0; n < 3; n++) h.addMessage('assistant', 'Limit: 12 people; assistant estimate unverified. '.repeat(120), { type: 'constraint', status: 'unresolved' });
    const second = await h.compact([], false, 0, true);
    assert.match(second.reason, /allowance used/); assert.equal(calls, 1);
    await h.compact([], true); assert.equal(calls, 2);
    assert.ok(store.context(id).segments.some(s => s.type === 'user' && s.content === 'Preserve the limit and caveat.'));
    const derived = store.context(id).segments.filter(s => s.parent_bundle_ids.length);
    assert.ok(derived.every(s => /12 people.*unverified/.test(s.content)));
  } finally { store.close(); }
});

const update = (key, source, extra = {}) => ({
  key,
  source_event_ids: [source],
  type: "decision",
  status: "active",
  content: "Reported proposal; not a user decision.",
  supersedes: [],
  conflicts_with: [],
  supports: [],
  limitations: ["Unverified."],
  ...extra,
});
const final = {
  status: "completed",
  usage: { input_tokens: 100, output_tokens: 10 },
  output: [
    { type: "message", content: [{ type: "output_text", text: "Finished." }] },
  ],
};

test("conversation handles survive offload, restore, reindex and a SQLite restart without changing canonical snapshots", () => {
  const directory = mkdtempSync(join(tmpdir(), "converse-refs-"));
  let store = new Store(directory);
  try {
    const id = store.create("Stable refs"),
      h = new Harness(store, id, { name: "openai" });
    const original = h.addMessage(
      "assistant",
      "Preserve this caveat and the original attribution. ".repeat(250),
    );
    const canonical = store.snapshot(id, 1),
      ref = store.describeSegments(id, canonical.segments)[0];
    assert.equal(ref.segmentRef, "S1");
    assert.equal(ref.sourceRefs[0].sourceRef, "E1");
    h.offload(["s1"]);
    assert.equal(
      store.describeSegments(id, store.context(id).segments)[0].referenceRef,
      "S1",
    );
    assert.equal(
      h.toolResult("resolve_context", { bundle_id: "S1", offset: 0 }, [])
        .source_event_ids[0],
      original.event.id,
    );
    store.restore(id, 1);
    store.reindex();
    assert.equal(
      store.describeSegments(id, store.context(id).segments)[0].segmentRef,
      "S1",
    );
    assert.deepEqual(store.snapshot(id, 1), canonical);
    store.close();
    store = new Store(directory);
    assert.equal(store.resolveBundle(id, "S1").id, original.item.id);
    assert.equal(store.source(id, "e1").id, original.event.id);
    assert.equal(store.references(id).segments.size, 2);
    const other = store.create("Other");
    assert.throws(
      () => store.resolveBundle(other, "S1"),
      /belong to this conversation/,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("selector holds stay advisory; mutation preflight reports every actual guard and preserves atomicity", async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(),
      adapter = {
        select: async (plan) => ({
          decisions: plan.entries
            .filter((e) => !e.protected)
            .map((e) => ({
              bundle_id: e.bundle_id,
              action: "escalate",
              priority: 3,
              reason: "Uncertain.",
            })),
        }),
      };
    const h = new Harness(
      store,
      id,
      { name: "openai" },
      { budget: 256000, recent: 2, decisionAdapter: adapter },
    );
    const old = h.addMessage(
      "assistant",
      "Caveat: estimate unverified; author is an assistant. ".repeat(200),
    );
    h.pin("Exact constraint.");
    h.updateState({
      expected_revision: store.context(id).revision,
      updates: [update("proposal", old.event.id)],
    });
    h.addMessage("assistant", "Recent answer.");
    h.addMessage("user", "Current objective.");
    const before = store.context(id);
    const review = await h.compact([], false, 0, true);
    assert.equal(review.status, "no_change");
    const inspected = h.toolResult(
      "inspect_context",
      { bundle_ids: [], operation: "offload" },
      [],
    );
    assert.equal(inspected.entries[0].advisory.action, "escalate");
    assert.equal(inspected.entries[0].can_offload, true);
    assert.ok(
      inspected.blocked.some((e) => e.reasons.some((r) => r.code === "pin")),
    );
    assert.ok(
      inspected.blocked.some((e) => e.reasons.some((r) => r.code === "state")),
    );
    assert.ok(
      inspected.blocked.some((e) =>
        e.reasons.some((r) => r.code === "current_request"),
      ),
    );
    assert.throws(
      () =>
        h.toolResult(
          "offload_context",
          {
            bundle_ids: inspected.entries.map((e) => e.segmentRef),
            expected_revision: before.revision,
          },
          [],
        ),
      (e) => e.inspection.blocked.length === 4,
    );
    assert.deepEqual(store.context(id), before);
    h.toolResult(
      "offload_context",
      { bundle_ids: ["S1"], expected_revision: before.revision },
      [],
    );
    assert.equal(store.context(id).segments[0].type, "reference");
    assert.equal(store.resolveBundle(id, "S1").content, old.item.content);
    assert.equal(store.source(id, "E1").content, old.event.content);
    assert.throws(
      () => h.offload(["S1", old.item.id]),
      /distinct segment references/,
    );
  } finally {
    store.close();
  }
});

test("selector cache persists between harnesses, invalidates when candidates change, and allows explicit refresh", async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0;
  try {
    const id = store.create(),
      adapter = {
        select: async (plan) => {
          calls++;
          return {
            decisions: plan.entries
              .filter((e) => !e.protected)
              .map((e) => ({
                bundle_id: e.bundle_id,
                action: "retain",
                priority: 2,
                reason: "Needed.",
              })),
          };
        },
      };
    const create = () =>
      new Harness(
        store,
        id,
        { name: "openai" },
        { budget: 256000, recent: 2, decisionAdapter: adapter },
      );
    let h = create();
    for (let n = 0; n < 5; n++)
      h.addMessage("assistant", "Background ".repeat(150));
    await h.compact([], false, 0, true);
    h = create();
    const result = await h.compact([], false, 0, true);
    assert.equal(calls, 1);
    assert.equal(result.decision_cache_hit, true);
    assert.equal(result.selection_outcome, "retained");
    await h.selectionPlan("", [], true);
    assert.equal(calls, 2);
    h.addMessage("assistant", "Changed candidate set.");
    await h.compact([], false, 0, true);
    assert.equal(calls, 3);
  } finally {
    store.close();
  }
});

test("Jev priority uncertainty does not override a confident action", () => {
  const adapter = new JevDecisionAdapter({ name: "typesafe" });
  const levels = [
    "Superseded or irrelevant",
    "Routine historical detail",
    "Useful background",
    "Important task constraint or unresolved choice",
    "Essential to the current task",
  ];
  const response = (confidence) => ({
    answers: {
      action_0: {
        type: "choice",
        choice: "offload",
        confidence,
        probabilities: {
          retain: 0.1,
          offload: 0.8,
          compact: 0.05,
          escalate: 0.05,
        },
      },
      priority_0: {
        type: "score",
        score: 1.2,
        confidence: 0.39,
        probabilities: { 0: 0.1, 1: 0.4, 2: 0.3, 3: 0.1, 4: 0.1 },
        legend: Object.fromEntries(levels.map((v, n) => [n, v])),
      },
    },
  });
  const candidates = [
    { bundle_id: "cb_fixture", can_offload: true, priority: 1 },
  ];
  assert.equal(
    adapter.validate(response(0.86), candidates)[0].action,
    "offload",
  );
  assert.equal(adapter.validate(response(0.86), candidates)[0].priority, 1);
  assert.equal(
    adapter.validate(response(0.4), candidates)[0].action,
    "escalate",
  );
});

test("named state relationships and S/E handles store canonical IDs and reject forward/stale references", () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(),
      h = new Harness(store, id, { name: "openai" });
    const source = h.addMessage("assistant", "Historical source.");
    h.toolResult(
      "update_state",
      { expected_revision: 1, updates: [update("proposal", "E1")] },
      [],
    );
    const original = store.context(id).segments.find((s) => s.state_key);
    h.toolResult(
      "update_state",
      {
        expected_revision: 2,
        updates: [
          update("caveat", "E1", {
            supports: ["state:proposal", "proposal", "S2"],
          }),
        ],
      },
      [],
    );
    const caveat = store
      .context(id)
      .segments.find((s) => s.state_key === "caveat");
    assert.deepEqual(caveat.relations.supports, [original.id]);
    assert.deepEqual(caveat.source_event_ids, [source.event.id]);
    const before = store.context(id);
    assert.throws(
      () =>
        h.toolResult(
          "update_state",
          { expected_revision: 2, updates: [update("stale", "E1")] },
          [],
        ),
      /Stale/,
    );
    assert.throws(
      () =>
        h.toolResult(
          "update_state",
          {
            expected_revision: 3,
            updates: [
              update("new", "E1"),
              update("next", "E1", { supports: ["state:new"] }),
            ],
          },
          [],
        ),
      /New entries in this batch/,
    );
    assert.deepEqual(store.context(id), before);
  } finally {
    store.close();
  }
});

test("resuming an older agent checkpoint expires advisory locks but keeps the current objective guarded", async () => {
  const store = new Store(undefined, { memory: true });
  try {
    const service = new ConclaveService(store, {
      availability: () => ({ openai: true }),
      providerFactory: () => ({ name: "openai", respond: async () => final }),
    });
    const id = service.create().conversation_id;
    const old = service
      .harness(id)
      .addMessage("assistant", "Old background. ".repeat(200));
    const view = await service.agentStart(id, {
      message_id: "resume",
      content: "Finish.",
      settings: { jev: false },
    });
    const state = structuredClone(agentState(store, id));
    state.harness_version = 3;
    state.protected_ids.push(old.item.id);
    store.append(id, "agent_checkpoint", "running", { state });
    const completed = await service.agentStep(id, {
      run_id: view.agent.run_id,
      expected_step: view.agent.steps,
    });
    assert.equal(completed.agent.status, "completed");
    const saved = agentState(store, id);
    assert.equal(saved.harness_version, 4);
    assert.ok(!saved.protected_ids.includes(old.item.id));
    assert.equal(saved.protected_ids.length, 1);
  } finally {
    store.close();
  }
});

test("audit paging exposes truncation and links tool failures to the actual submitted request", () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create(),
      h = new Harness(store, id, { name: "openai" });
    const source = h.addMessage("assistant", "Background");
    const request = store.append(id, "inference_request", "answer", {
      provider: "openai",
      context_revision: 1,
      payload: { model: "model" },
    });
    store.append(id, "inference_response", "answer", {
      request_id: request.id,
      output: [{ type: "function_call", call_id: "call_1" }],
    });
    store.append(id, "tool_call", "offload_context", {
      call_id: "call_1",
      arguments: "{}",
    });
    store.append(
      id,
      "tool_result",
      JSON.stringify({
        error: "Blocked.",
        inspection: {
          blocked: [
            {
              id: source.item.id,
              segmentRef: "S1",
              reasons: [{ label: "Current request" }],
            },
          ],
        },
      }),
      { call_id: "call_1", tool: "offload_context" },
    );
    store.append(id, "decision_proposal", "Advice", {
      entries: Array.from({ length: 20 }, () => ({
        bundle_id: source.item.id,
        action: "retain",
      })),
    });
    const page = contextAudit(store, id, { limit: 2, kind: "all" });
    assert.equal(page.records[0].request_id, request.id);
    assert.equal(page.records[0].model, "model");
    assert.equal(page.records[0].outcome, "failed");
    assert.equal(page.records[0].blocked[0].segmentRef, "S1");
    assert.equal(page.records[1].entries_omitted, 8);
    assert.equal(page.has_more, true);
    const earlier = contextAudit(store, id, {
      before_seq: page.before_cursor,
      limit: 2,
      kind: "all",
    });
    assert.ok(earlier.records.every((e) => e.seq < page.before_cursor));
    assert.ok(
      !earlier.records.some((e) => page.records.some((p) => p.id === e.id)),
    );
  } finally {
    store.close();
  }
});

const latestExport = new URL('../docs/conversations/conv_b65bc693-2839-4ff5-a3ce-31d9ba602b42.json', import.meta.url);
test("latest exported failure replays with eligible old targets and lossless source retrieval", { skip: !existsSync(latestExport) }, () => {
  const record = JSON.parse(
    readFileSync(
      new URL(
        "../docs/conversations/conv_b65bc693-2839-4ff5-a3ce-31d9ba602b42.json",
        import.meta.url,
      ),
    ),
  );
  const store = new Store(undefined, { memory: true }),
    id = record.conversation_id;
  try {
    const layer = record.context_layer;
    for (const e of layer.events)
      store.db
        .prepare("INSERT INTO events VALUES (?,?,?,?,?,?,?,?)")
        .run(
          e.seq,
          e.id,
          id,
          e.kind,
          e.actor,
          e.timestamp,
          e.content,
          JSON.stringify(e.metadata),
        );
    for (const s of layer.snapshots)
      store.db
        .prepare("INSERT INTO snapshots VALUES (?,?,?,?)")
        .run(id, s.revision, JSON.stringify(s.segments), s.receipt_id);
    const h = new Harness(store, id, { name: "openai" });
    const failedCalls = layer.events.filter(
      (e) =>
        e.kind === "tool_call" &&
        e.content === "offload_context" &&
        e.seq > 582,
    );
    const targets = [
      ...new Set(
        failedCalls.flatMap((e) => JSON.parse(e.metadata.arguments).bundle_ids),
      ),
    ];
    const plan = h.inspectContext(targets),
      before = store.context(id);
    assert.ok(
      plan.eligible_ids.length > 0,
      "Advisory-retained older targets are now eligible",
    );
    assert.ok(
      plan.blocked.every((e) =>
        e.reasons.some((r) =>
          ["recent", "pin", "verbatim", "state", "current_request"].includes(
            r.code,
          ),
        ),
      ),
    );
    h.toolResult(
      "offload_context",
      { bundle_ids: plan.eligible_ids, expected_revision: before.revision },
      [],
    );
    assert.ok(
      budgetUnits(store.context(id).segments) < budgetUnits(before.segments),
    );
    for (const original of before.segments.filter((s) =>
      plan.eligible_ids.includes(s.id),
    )) {
      assert.equal(
        store.resolveBundle(id, original.id).content,
        original.content,
      );
      for (const source of original.source_event_ids)
        assert.equal(store.source(id, source).id, source);
    }
    for (const item of before.segments.filter(
      (s) => s.pinned || s.verbatim_required || s.state_key,
    ))
      assert.deepEqual(
        store.context(id).segments.find((s) => s.id === item.id),
        item,
      );
  } finally {
    store.close();
  }
});
