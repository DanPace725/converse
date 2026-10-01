import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { segment } from "../lib/conclave/store.js";
import { retentionPlan } from "../lib/conclave/attention.js";

const response = (output) => ({
  status: "completed",
  model: "fixture",
  usage: { input_tokens: 100, output_tokens: 10 },
  output,
});
const call = (name, args, n) =>
  response([
    {
      type: "function_call",
      call_id: "call_" + n,
      name,
      arguments: JSON.stringify(args),
    },
  ]);
const final = response([
  {
    type: "message",
    content: [{ type: "output_text", text: "Verified current saved file." }],
  },
]);
const next = (view) => ({
  run_id: view.agent.run_id,
  expected_step: view.agent.steps,
});

test("chat edits the same versioned workspace, preserves unmatched sections, and rejects stale/destructive replacements", async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0,
    original;
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({
      name: "openai",
      respond: async (payload) => {
        calls++;
        assert.ok(payload.tools.some((t) => t.name === "workspace_patch"));
        if (calls === 1)
          return call("workspace_read", { path: "plan.md", offset: 0 }, 1);
        if (calls === 2)
          return call(
            "workspace_patch",
            {
              path: "plan.md",
              find: "Budget: 100",
              replace: "Budget: 150",
              expected_source_event_id: original.source_event_id,
            },
            2,
          );
        if (calls === 3) {
          const manifest = JSON.parse(payload.input[1].content.split("\n")[1]);
          assert.notEqual(
            manifest[0].source_event_id,
            original.source_event_id,
          );
          return call("workspace_read", { path: "plan.md", offset: 0 }, 3);
        }
        return final;
      },
    }),
  });
  try {
    const id = service.create().conversation_id,
      h = service.harness(id);
    original = h.toolResult(
      "workspace_write",
      {
        path: "plan.md",
        content:
          "# Launch\nBudget: 100\n## Safeguarding\nKeep two adults.\n## Alternatives\nKeep option B.",
      },
      [],
    );
    const view = await service.ask(id, {
      message_id: "msg_edit",
      content: "Increase budget to 150 and preserve the rest.",
      settings: { model: "fixture" },
    });
    assert.match(view.workspace[0].content, /Budget: 150/);
    assert.match(
      view.workspace[0].content,
      /## Safeguarding\nKeep two adults.\n## Alternatives\nKeep option B./,
    );
    assert.equal(calls, 4);
    assert.equal(
      store.events(id).filter((e) => e.kind === "document").length,
      2,
    );
    assert.ok(
      !view.context.segments.some(
        (s) =>
          s.type === "evidence" &&
          s.source_event_ids.includes(original.source_event_id),
      ),
    );
    assert.throws(
      () =>
        h.toolResult(
          "workspace_patch",
          {
            path: "plan.md",
            find: "150",
            replace: "200",
            expected_source_event_id: original.source_event_id,
          },
          [],
        ),
      /Stale/,
    );
    assert.throws(
      () =>
        h.toolResult(
          "workspace_write",
          {
            path: "plan.md",
            content: "# Launch\nBudget: 200",
            expected_source_event_id: view.workspace[0].source_event_id,
          },
          [],
        ),
      /headings/,
    );
    assert.equal(
      service.workspaceFile(id, "plan.md").content,
      view.workspace[0].content,
    );
    assert.throws(() => service.workspaceFile(id, "../plan.md"), /not found/);
    h.addMessage("user", "Next turn requires a fresh read.");
    assert.throws(
      () =>
        h.toolResult(
          "workspace_patch",
          {
            path: "plan.md",
            find: "150",
            replace: "200",
            expected_source_event_id: view.workspace[0].source_event_id,
          },
          [],
        ),
      /Read every page/,
    );
  } finally {
    store.close();
  }
});

test("agent cannot complete after writing until every page of the current version is read", async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0;
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({
      name: "openai",
      respond: async (payload) => {
        calls++;
        if (calls === 1)
          return call(
            "workspace_write",
            { path: "long.md", content: "# Plan\n" + "x".repeat(8100) },
            1,
          );
        if (calls === 2) return final;
        assert.ok(
          payload.input.some(
            (i) =>
              typeof i.content === "string" &&
              i.content.startsWith("Completion check:"),
          ),
        );
        if (calls === 3)
          return call("workspace_read", { path: "long.md", offset: 0 }, 3);
        if (calls === 4)
          return call("workspace_read", { path: "long.md", offset: 8000 }, 4);
        return final;
      },
    }),
  });
  try {
    const id = service.create().conversation_id;
    let view = await service.agentStart(id, {
      content: "Write and verify.",
      message_id: "msg_verify",
      settings: { model: "fixture" },
    });
    view = await service.agentStep(id, next(view));
    view = await service.agentStep(id, next(view));
    assert.equal(view.agent.status, "running");
    assert.equal(view.messages.filter((m) => m.role === "assistant").length, 0);
    while (view.agent.status === "running")
      view = await service.agentStep(id, next(view));
    assert.equal(calls, 5);
    assert.equal(view.agent.status, "completed");
    assert.equal(view.messages.filter((m) => m.role === "assistant").length, 1);
    assert.equal(
      store.events(id).filter((e) => e.kind === "workspace_validation").length,
      1,
    );
  } finally {
    store.close();
  }
});

for (const provider of ["openai", "anthropic"])
  for (const mode of ["chat", "agent", "token-limit", "missing-usage"])
    test("default Jev under pressure: " + provider + " " + mode, async () => {
      const store = new Store(undefined, { memory: true });
      let taskCalls = 0,
        decisionCalls = 0;
      const service = new ConclaveService(store, {
        availability: () => ({ openai: true, anthropic: true, jev: true }),
        decisionFactory: () => ({
          select: async (plan, segments, query, invoke) => {
            decisionCalls++;
            await invoke(
              { model: "jev-fixture", questions: {} },
              "attention-selection",
              {
                budget: 8000,
                output: 0,
                provider: {
                  name: "typesafe",
                  respond: async (p, options) => {
                    if (mode !== "chat")
                      assert.ok(options.signal instanceof AbortSignal);
                    return {
                      usage:
                        mode === "missing-usage"
                          ? null
                          : {
                              input_tokens: mode === "token-limit" ? 9000 : 17,
                              output_tokens: 3,
                            },
                    };
                  },
                },
              },
            );
            return {
              decisions: plan.entries
                .filter((e) => !e.protected)
                .map((e) => ({
                  bundle_id: e.bundle_id,
                  action: "offload",
                  priority: 0,
                  reason: "older recoverable material",
                })),
            };
          },
        }),
        providerFactory: () => ({
          name: provider,
          respond: async () => {
            taskCalls++;
            return final;
          },
        }),
      });
      try {
        const id = service.create().conversation_id,
          h = service.harness(id);
        for (let n = 0; n < 5; n++)
          h.addMessage("assistant", "Old draft " + n + " " + "x".repeat(10000));
        for (let n = 0; n < 4; n++)
          h.addMessage("assistant", "Recent short item " + n);
        const input = {
          message_id: "msg_pressure",
          content: "Use current context.",
          settings: {
            provider,
            model: provider === "anthropic" ? "claude-fixture" : "fixture",
            budget: 64000,
            output: 1024,
          },
        };
        let view;
        if (mode === "chat") view = await service.ask(id, input);
        else {
          view = await service.agentStart(id, {
            ...input,
            limits: {
              max_total_tokens: mode === "token-limit" ? 10000 : 250000,
            },
          });
          view = await service.agentStep(id, next(view));
        }
        assert.equal(view.settings.jev, true);
        assert.equal(decisionCalls, 1);
        assert.equal(view.metrics.decision_calls, 1);
        if (mode === "token-limit" || mode === "missing-usage") {
          assert.equal(taskCalls, 0);
          assert.equal(
            view.agent.status,
            mode === "token-limit" ? "token_limit" : "failed",
          );
          assert.equal(
            view.agent.input_tokens,
            mode === "token-limit" ? 9000 : 0,
          );
        } else {
          assert.equal(taskCalls, 1);
          assert.equal(view.metrics.input_tokens, 117);
          if (mode === "agent") {
            assert.equal(view.agent.status, "completed");
            assert.equal(view.agent.input_tokens, 117);
          }
        }
        assert.ok(
          store
            .events(id)
            .some(
              (e) =>
                e.kind === "inference_request" &&
                e.content === "attention-selection",
            ),
        );
      } finally {
        store.close();
      }
    });

test("oversized older drafts are offloaded instead of skipped by compaction batch packing", () => {
  const draft = segment("x".repeat(20000), ["event_old"], {
    type: "assistant",
  });
  const pin = segment("Keep safeguarding unchanged", ["event_pin"], {
    type: "constraint",
    pinned: true,
  });
  const plan = retentionPlan([draft, pin], {
    batchBytes: 10000,
    measure: () => 30000,
    budget: 24000,
    recent: 1,
    force: true,
  });
  assert.deepEqual(plan.offload_bundle_ids, [draft.id]);
  assert.equal(
    plan.entries.find((e) => e.bundle_id === pin.id).action,
    "retain",
  );
});
