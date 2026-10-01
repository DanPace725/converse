import test from "node:test";
import assert from "node:assert/strict";
import {
  AnthropicProvider,
  anthropicPayload,
  responseText,
} from "../lib/conclave/provider.js";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { downloadRecord } from "../lib/context-repository.js";

const model = "claude-fixture";
const settings = { provider: "anthropic", model };
const native = (
  content,
  stop_reason = "end_turn",
  usage = { input_tokens: 100, output_tokens: 10 },
) => ({ id: "msg_native", model, content, stop_reason, usage });
const text = (value) => ({ type: "text", text: value });
const tool = (name, input, id) => ({ type: "tool_use", id, name, input });
const reply = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

test("Anthropic adapter groups parallel tool exchanges, drops OpenAI fields and signals tool errors", () => {
  const body = anthropicPayload({
    model,
    instructions: "System",
    max_output_tokens: 1024,
    reasoning: { effort: "low" },
    store: false,
    input: [
      { role: "user", content: "Objective" },
      { type: "reasoning", encrypted_content: "private-openai" },
      {
        role: "assistant",
        content: [{ type: "output_text", text: "Working" }],
      },
      ...["a", "b"].map((call_id) => ({
        type: "function_call",
        call_id,
        name: "calculate",
        arguments: '{"values":[1,2]}',
      })),
      ...["a", "b"].map((call_id) => ({
        type: "function_call_output",
        call_id,
        output:
          call_id === "a" ? '{"result":3}' : '{"error":"invalid operation"}',
      })),
      { role: "user", content: "Continue" },
    ],
    tools: [
      {
        type: "function",
        name: "calculate",
        description: "Arithmetic",
        strict: true,
        parameters: { type: "object" },
      },
    ],
  });
  assert.deepEqual(
    body.messages.map((m) => m.role),
    ["user", "assistant", "user"],
  );
  assert.deepEqual(
    body.messages[1].content.map((p) => p.type),
    ["text", "tool_use", "tool_use"],
  );
  assert.deepEqual(
    body.messages[2].content.map((p) => p.type),
    ["tool_result", "tool_result", "text"],
  );
  assert.equal(body.messages[2].content[1].is_error, true);
  assert.equal(body.tools[0].input_schema.type, "object");
  assert.equal(JSON.stringify(body).includes("private-openai"), false);
  assert.equal(body.max_tokens, 1024);
  assert.equal(body.reasoning, undefined);
});

test("Anthropic structured compaction returns schema JSON; truncation preserves billed usage and deadlines propagate", async () => {
  let body, signal;
  const provider = new AnthropicProvider({
    apiKey: "fixture-secret",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(options.headers["anthropic-version"], "2023-06-01");
      body = JSON.parse(options.body);
      signal = options.signal;
      return reply(
        native([text('{"additions":[]}')], "end_turn", {
          input_tokens: 10,
          output_tokens: 3,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 5,
        }),
      );
    },
  });
  const controller = new AbortController();
  const result = await provider.respond(
    {
      model,
      input: [{ role: "user", content: "Compact" }],
      max_output_tokens: 1024,
      text: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { additions: { type: "array" } },
          },
        },
      },
    },
    { signal: controller.signal },
  );
  assert.equal(body.output_config.format.type, "json_schema");
  assert.equal(body.tool_choice, undefined);
  assert.equal(result.status, "completed");
  assert.deepEqual(JSON.parse(responseText(result)), { additions: [] });
  assert.equal(result.usage.input_tokens, 35);
  controller.abort();
  assert.equal(signal.aborted, true);
  provider.fetch = async () => reply(native([text("partial")], "max_tokens"));
  const incomplete = await provider.respond({
    model,
    input: [],
    max_output_tokens: 1024,
  });
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.incomplete_details.reason, "max_tokens");
  assert.equal(incomplete.usage.output_tokens, 10);
  provider.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "fixture-secret rejected" } }),
      { status: 401 },
    );
  await assert.rejects(
    () => provider.respond({ input: [] }),
    /Anthropic 401: \[redacted\] rejected/,
  );
});

test("Claude agent resumes using native tool results, verifies workspace and exports correct mixed-provider attribution", async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0;
  const provider = new AnthropicProvider({
    apiKey: "fixture",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, model);
      assert.ok(body.system.includes("provider=anthropic"));
      for (const name of [
        "calculate",
        "workspace_write",
        "workspace_read",
        "update_state",
        "edit_context",
        "offload_context",
        "search_history",
      ])
        assert.ok(
          body.tools.some((t) => t.name === name),
          name,
        );
      calls++;
      if (calls === 1)
        return reply(
          native(
            [
              { type: "thinking", thinking: "", signature: "signed-thought" },
              tool(
                "calculate",
                { operation: "multiply", values: [6, 7] },
                "calc",
              ),
            ],
            "tool_use",
          ),
        );
      const blocks = body.messages.flatMap((m) => m.content);
      assert.ok(
        blocks.some(
          (p) =>
            p.type === "thinking" &&
            p.signature === "signed-thought" &&
            p.thinking === "",
        ),
      );
      assert.ok(
        blocks.some(
          (p) =>
            p.type === "tool_result" &&
            p.tool_use_id === "calc" &&
            p.content === '{"result":42}',
        ),
      );
      if (calls === 2)
        return reply(
          native(
            [
              tool(
                "workspace_write",
                {
                  path: "proof.md",
                  content: "Result: 42",
                  expected_source_event_id: null,
                },
                "write",
              ),
            ],
            "tool_use",
          ),
        );
      const written = store
        .events(id)
        .find((e) => e.metadata.workspace_path === "proof.md");
      if (calls === 3)
        return reply(
          native(
            [
              tool(
                "workspace_read",
                {
                  path: "proof.md",
                  offset: 0,
                  expected_source_event_id: written.id,
                },
                "read",
              ),
            ],
            "tool_use",
          ),
        );
      assert.ok(
        blocks.some(
          (p) =>
            p.type === "tool_result" &&
            p.tool_use_id === "read" &&
            p.content.includes("Result: 42"),
        ),
      );
      return reply(native([text("Verified: 42.")]));
    },
  });
  const makeService = () =>
    new ConclaveService(store, {
      availability: () => ({ openai: true, anthropic: true, jev: false }),
      providerFactory: (selected) =>
        selected === "anthropic"
          ? provider
          : {
              name: "openai",
              respond: async () => ({
                status: "completed",
                model: "gpt-fixture",
                usage: { input_tokens: 10, output_tokens: 2 },
                output: [
                  {
                    type: "message",
                    content: [
                      { type: "output_text", text: "GPT continuation" },
                    ],
                  },
                ],
              }),
            },
    });
  const id = makeService().create().conversation_id;
  try {
    let view = await makeService().agentStart(id, {
      message_id: "objective",
      content: "Calculate, write and verify.",
      settings,
    });
    while (view.agent.status === "running") {
      view = await makeService().agentStep(id, {
        run_id: view.agent.run_id,
        expected_step: view.agent.steps,
      });
      if (view.agent.status === "running") {
        const count = calls;
        await makeService().agentStep(id, {
          run_id: view.agent.run_id,
          expected_step: view.agent.steps - 1,
        });
        assert.equal(calls, count, "Retries must not spend twice");
      }
    }
    assert.equal(view.agent.status, "completed", view.agent.error);
    assert.equal(calls, 4);
    assert.equal(view.workspace[0].content, "Result: 42");
    assert.equal(view.messages.at(-1).provider, "Claude");
    assert.equal(view.messages.at(-1).participant_id, "claude");
    assert.equal(view.settings.provider, "anthropic");
    assert.equal(view.settings.reasoning, "none");
    assert.equal(view.metrics.usage_by_provider.anthropic.calls, 4);
    const events = store.events(id);
    assert.equal(
      events.find((e) => e.metadata.workspace_path === "proof.md").actor,
      "anthropic",
    );
    assert.ok(
      events
        .filter((e) => e.kind === "tool_call")
        .every((e) => e.actor === "anthropic"),
    );
    assert.equal(
      events.find((e) => e.kind === "inference_request").metadata
        .provider_payload.model,
      model,
    );
    assert.deepEqual(
      downloadRecord(makeService(), id).participants.map(
        (p) => p.participant_id,
      ),
      ["human", "claude"],
    );
    view = await makeService().ask(id, {
      message_id: "gpt",
      content: "Continue as GPT",
      settings: { model: "gpt-fixture" },
    });
    assert.deepEqual(
      view.messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.provider),
      ["Claude", "GPT"],
    );
    assert.deepEqual(
      downloadRecord(makeService(), id).participants.map(
        (p) => p.participant_id,
      ),
      ["human", "claude", "gpt"],
    );
    await assert.rejects(
      () =>
        makeService().ask(id, {
          message_id: "bad",
          content: "Bad",
          settings: { provider: "openai", model },
        }),
      /Model does not match/,
    );
  } finally {
    store.close();
  }
});

test("Claude context chat calls history tools and rejects incomplete output without completing the turn", async () => {
  const store = new Store(undefined, { memory: true });
  let count = 0;
  const provider = new AnthropicProvider({
    apiKey: "fixture",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      count++;
      if (count === 1)
        return reply(
          native(
            [tool("search_history", { query: "original" }, "search")],
            "tool_use",
          ),
        );
      if (count === 2) {
        assert.ok(
          body.messages
            .at(-1)
            .content.some(
              (p) => p.type === "tool_result" && p.tool_use_id === "search",
            ),
        );
        return reply(native([text("Found original source.")]));
      }
      return reply(native([text("Truncated")], "max_tokens"));
    },
  });
  const service = new ConclaveService(store, {
    providerFactory: () => provider,
    availability: () => ({ anthropic: true }),
  });
  const id = service.create().conversation_id;
  try {
    const view = await service.ask(id, {
      message_id: "chat",
      content: "Find original source",
      settings,
    });
    assert.equal(view.messages.at(-1).provider, "Claude");
    await assert.rejects(
      () =>
        service.ask(id, { message_id: "truncated", content: "More", settings }),
      /response incomplete/,
    );
    assert.equal(
      service.view(id).messages.filter((m) => m.role === "assistant").length,
      1,
    );
    assert.equal(service.view(id).messages.at(-1).answer_failed, true);
  } finally {
    store.close();
  }
});
