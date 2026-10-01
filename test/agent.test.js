import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { agentState } from "../lib/conclave/agent.js";
import { createConclaveHandler } from "../lib/conclave-local.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tool = (name, args, n) => ({
  type: "function_call",
  call_id: `call_${n}`,
  name,
  arguments: JSON.stringify(args),
});
const response = (output) => ({
  status: "completed",
  model: "fixture",
  usage: { input_tokens: 100, output_tokens: 20 },
  output,
});
const final = response([
  {
    type: "message",
    content: [{ type: "output_text", text: "Done: total is 42." }],
  },
]);
const start = (id, extra = {}) => ({
  conversation_id: id,
  message_id: "msg_agent",
  content: "Calculate and write a report.",
  settings: { model: "fixture" },
  ...extra,
});
const step = (view) => ({
  run_id: view.agent.run_id,
  expected_step: view.agent.steps,
});
function fixture(store, respond) {
  return new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({ name: "openai", respond }),
  });
}

test("agent runs across fresh service instances, preserves reasoning/tools/sources, and retries do not spend twice", async () => {
  const directory = mkdtempSync(join(tmpdir(), "converse-agent-"));
  let store = new Store(directory),
    calls = 0;
  const provider = async (payload) => {
    calls++;
    assert.equal(payload.max_output_tokens, 16384);
    assert.ok(payload.tools.some((t) => t.name === "update_state"));
    if (calls === 1)
      return response([
        { type: "reasoning", id: "rs_fixture", encrypted_content: "fixture" },
        tool("calculate", { operation: "multiply", values: [6, 7] }, 1),
      ]);
    assert.ok(payload.input.some((i) => i.id === "rs_fixture"));
    assert.ok(
      payload.input.some(
        (i) => i.call_id === "call_1" && i.output === '{"result":42}',
      ),
    );
    if (calls === 2)
      return response([
        tool(
          "workspace_write",
          { path: "report.md", content: "# Result\n42" },
          2,
        ),
      ]);
    if (calls === 3)
      return response([
        tool("workspace_read", { path: "report.md", offset: 0 }, 3),
      ]);
    assert.ok(
      payload.input.some(
        (i) => i.call_id === "call_3" && i.output?.includes("# Result"),
      ),
    );
    return final;
  };
  try {
    let service = fixture(store, provider);
    const id = service.create("Agent fixture").conversation_id;
    let view = await service.agentStart(id, start(id));
    assert.equal(view.settings.budget, 256000);
    const firstStep = step(view);
    view = await service.agentStep(id, firstStep);
    assert.equal(view.agent.status, "running");
    await service.agentStep(id, firstStep);
    assert.equal(calls, 1);
    store.close();
    store = new Store(directory);
    service = fixture(store, provider);
    while (view.agent.status === "running")
      view = await service.agentStep(id, step(view));
    assert.equal(view.agent.status, "completed");
    assert.equal(view.agent.steps, 4);
    assert.equal(view.agent.input_tokens, 400);
    assert.equal(view.metrics.calls, 4);
    assert.equal(view.messages.at(-1).reply_to, "msg_agent");
    assert.equal(view.agent.files[0].content, "# Result\n42");
    const source = store.source(id, view.agent.files[0].source_event_id);
    assert.equal(source.actor, "openai");
    assert.equal(source.kind, "document");
    assert.ok(
      service.export(id).events.some((e) => e.kind === "agent_checkpoint"),
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});

test("time, steps, total tokens, stop, interrupted requests and missing usage stop explicitly", async (t) => {
  for (const scenario of [
    "expired",
    "step_limit",
    "token_limit",
    "stopped",
    "interrupted",
    "failed",
  ]) {
    await t.test(scenario, async () => {
      const store = new Store(undefined, { memory: true });
      let calls = 0;
      try {
        const service = fixture(store, async () => {
          calls++;
          return scenario === "failed"
            ? { ...final, usage: null }
            : response([
                tool("calculate", { operation: "add", values: [1, 2] }, 1),
              ]);
        });
        const id = service.create().conversation_id;
        let view = await service.agentStart(
          id,
          start(id, {
            limits: {
              max_steps: 1,
              max_total_tokens: scenario === "token_limit" ? 1000 : 250000,
            },
          }),
        );
        if (scenario === "expired" || scenario === "interrupted") {
          const state = structuredClone(agentState(store, id));
          if (scenario === "expired") state.deadline = Date.now() - 1;
          else state.phase = "inflight";
          store.append(id, "agent_checkpoint", "running", { state });
        }
        view =
          scenario === "stopped"
            ? await service.agentStop(id, step(view))
            : await service.agentStep(id, step(view));
        assert.equal(view.agent.status, scenario);
        assert.equal(
          calls,
          ["step_limit", "failed"].includes(scenario) ? 1 : 0,
        );
        await service.agentStep(id, step(view));
        assert.equal(
          calls,
          ["step_limit", "failed"].includes(scenario) ? 1 : 0,
        );
      } finally {
        store.close();
      }
    });
  }
});

test("HTTP agent actions use the same service; invalid tools are recorded and concurrent edits rejected", async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0;
  try {
    const service = fixture(store, async (payload) => {
      calls++;
      if (calls === 1)
        return response([
          tool("workspace_write", { path: "../escape.md", content: "bad" }, 1),
        ]);
      assert.match(
        payload.input.find((i) => i.type === "function_call_output").output,
        /relative workspace path/,
      );
      return final;
    });
    const handler = await createConclaveHandler({ service });
    const { session } = await import("../lib/access.js");
    process.env.APP_PASSWORD = "agent-fixture";
    const invoke = async (input) => {
      const res = {
        writeHead(status) {
          this.status = status;
        },
        end(value) {
          this.data = JSON.parse(value);
        },
      };
      await handler(
        {
          method: "POST",
          url: "/api/conclave",
          body: input,
          headers: {
            host: "localhost",
            "content-type": "application/json",
            cookie: "converse_session=" + session(),
          },
        },
        res,
      );
      return res;
    };
    const id = service.create().conversation_id;
    assert.equal(
      (
        await invoke({
          ...start(id),
          action: "agent_start",
          limits: { max_steps: 0 },
        })
      ).status,
      400,
    );
    let result = await invoke({ ...start(id), action: "agent_start" });
    assert.equal(result.status, 200);
    assert.equal(
      (await invoke({ ...start(id), action: "agent_start" })).status,
      409,
    );
    assert.equal(
      (await invoke({ action: "ask", ...start(id), message_id: "msg_chat" }))
        .status,
      409,
    );
    result = await invoke({
      action: "agent_step",
      conversation_id: id,
      ...step(result.data),
    });
    assert.equal(result.data.agent.files.length, 0);
    result = await invoke({
      action: "agent_step",
      conversation_id: id,
      ...step(result.data),
    });
    assert.equal(result.data.agent.status, "completed");
    assert.equal(
      store.events(id).filter((e) => e.kind === "tool_result").length,
      1,
    );
    assert.throws(() => service.settings({ budget: 513000 }), /budget/);
  } finally {
    store.close();
  }
});

test("agent continues beyond chat call limits, updates Conclave state and protects the objective", async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0;
  try {
    const service = fixture(store, async (payload) => {
      calls++;
      const context = payload.input[0].content;
      const revision = Number(context.match(/revision (\d+)/)[1]);
      const items = JSON.parse(context.split("\n")[1]);
      const objective = items.find((item) => item.type === "user");
      if (calls === 1)
        return response([
          tool(
            "update_state",
            {
              expected_revision: revision,
              updates: [
                {
                  key: "task.goal",
                  type: "objective",
                  content: "Calculate and write a report.",
                  source_event_ids: objective.source_event_ids,
                  status: "active",
                  supersedes: [],
                  conflicts_with: [],
                  supports: [],
                  limitations: [],
                },
              ],
            },
            1,
          ),
        ]);
      if (calls === 2)
        return response([
          tool(
            "edit_context",
            {
              expected_revision: revision,
              remove_ids: [objective.id],
              additions: [],
            },
            2,
          ),
        ]);
      if (calls < 7)
        return response([
          tool("calculate", { operation: "add", values: [calls, 1] }, calls),
        ]);
      return final;
    });
    const id = service.create().conversation_id;
    let view = await service.agentStart(id, start(id));
    while (view.agent.status === "running")
      view = await service.agentStep(id, step(view));
    assert.equal(view.agent.status, "completed");
    assert.equal(calls, 7);
    assert.ok(view.context.segments.some((s) => s.state_key === "task.goal"));
    assert.ok(view.context.segments.some((s) => s.type === "user"));
    const results = store.events(id).filter((e) => e.kind === "tool_result");
    assert.ok(
      JSON.parse(results[0].content).updated_keys.includes("task.goal"),
    );
    assert.ok(JSON.parse(results[1].content).error);
  } finally {
    store.close();
  }
});
