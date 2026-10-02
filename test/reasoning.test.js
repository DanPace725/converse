import test from "node:test";
import assert from "node:assert/strict";
import { chat } from "../lib/providers.js";
import { reasoningSettings, reasoningSummary } from "../lib/reasoning.js";
import { AnthropicProvider, OpenAIProvider } from "../lib/conclave/provider.js";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { Harness } from "../lib/conclave/harness.js";
import { downloadRecord } from "../lib/context-repository.js";
import { runMetrics } from '../lib/conclave/agent-diagnostics.js';

const message = (text) => ({
  type: "message",
  content: [{ type: "output_text", text }],
});
const json = (data) => new Response(JSON.stringify(data));
const sse = (events) =>
  new Response(
    events.map((e) => "data: " + JSON.stringify(e) + "\r\n\r\n").join(""),
  );

test('a truncated native Claude stream archives its signature and marks streamed usage partial', async () => {
  const store = new Store(undefined, { memory: true });
  const provider = new AnthropicProvider({ apiKey: 'fixture', fetchImpl: async () => sse([
    { type: 'message_start', message: { model: 'claude-sonnet-5', content: [], usage: { input_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Partial native rationale' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'partial-signature' } },
  ]) });
  const service = new ConclaveService(store, { availability: () => ({ anthropic: true }), providerFactory: () => provider });
  const id = service.create().conversation_id;
  try {
    await assert.rejects(() => service.ask(id, { message_id: 'question', content: 'Answer', settings: { provider: 'anthropic', model: 'claude-sonnet-5', jev: false } }, { onEvent() {} }), /unexpectedly/);
    const events = store.events(id), response = events.find(e => e.kind === 'inference_response');
    assert.equal(response.metadata.output[0].anthropic_content.signature, 'partial-signature');
    assert.equal(response.metadata.usage.input_tokens, 9);
    assert.equal(response.metadata.status, 'partial');
    assert.equal(service.view(id).messages[0].reasoning.length, 1);
    assert.equal(service.view(id).messages[0].reasoning[0].text, 'Partial native rationale');
    assert.equal(runMetrics(events, { started_after_seq: 0, run_id: 'fixture' }).usage_complete, false);
  } finally { store.close(); }
});

test("capabilities exclude non-reasoning models and readable projections never expose opaque fields", () => {
  for (const model of ["gpt-4o", "gpt-5-chat-latest", "o3-mini", "fixture"])
    assert.deepEqual(reasoningSettings("GPT", model), {});
  assert.equal(
    reasoningSettings("GPT", "gpt-6-luna").reasoning.summary,
    "auto",
  );
  assert.equal(
    reasoningSettings("Claude", "claude-sonnet-5").thinking.type,
    "adaptive",
  );
  assert.equal(
    reasoningSettings("Claude", "claude-haiku-4-5", 2048).thinking
      .budget_tokens,
    2047,
  );
  assert.deepEqual(reasoningSettings("Claude", "claude-haiku-4-5", 512), {});
  assert.deepEqual(reasoningSettings("GPT", "gpt-6-luna", 4096, false), {});
  const summary = reasoningSummary("Claude", {
    content: [
      {
        type: "thinking",
        thinking: "Reported rationale",
        signature: "secret-signature",
      },
      { type: "redacted_thinking", data: "redacted-data" },
    ],
  });
  assert.equal(summary.text, "Reported rationale");
  assert.equal(summary.opaque_available, true);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /secret-signature|redacted-data/,
  );
});

test("ordinary chat captures all three native outputs while sending only attributed readable history", async () => {
  const fetchBefore = globalThis.fetch;
  const envBefore = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
  ].map((name) => [name, process.env[name]]);
  for (const [name] of envBefore) process.env[name] = "reasoning-fixture";
  const cases = [
    [
      "GPT",
      "gpt-6-luna",
      {
        status: "completed",
        output: [
          {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "GPT rationale" }],
            encrypted_content: "cipher",
          },
          message("Answer"),
        ],
        usage: { input_tokens: 2, output_tokens: 8 },
      },
    ],
    [
      "Claude",
      "claude-sonnet-5",
      {
        stop_reason: "end_turn",
        content: [
          {
            type: "thinking",
            thinking: "Claude rationale",
            signature: "signed",
          },
          { type: "text", text: "Answer" },
        ],
      },
    ],
    [
      "Gemini",
      "gemini-3.1-pro-preview",
      {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { text: "Gemini rationale", thought: true },
                { text: "Answer", thoughtSignature: "answer-signature" },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 2,
          thoughtsTokenCount: 5,
          candidatesTokenCount: 3,
          totalTokenCount: 10,
        },
      },
    ],
  ];
  try {
    for (const [provider, model, native] of cases) {
      let sent;
      globalThis.fetch = async (_url, options) => {
        sent = JSON.parse(options.body);
        return json(native);
      };
      const result = await chat({
        provider,
        model,
        messages: [
          {
            role: "user",
            content: "Please answer",
            invocation: { native_output: ["cross-provider-cipher"] },
          },
        ],
      });
      assert.equal(result.text, "Answer");
      assert.equal(result.reasoning.text, provider + " rationale");
      assert.equal(result.reasoning.opaque_available, true);
      assert.deepEqual(
        result.provenance.native_output,
        native.output || native.content || native.candidates[0].content.parts,
      );
      assert.doesNotMatch(JSON.stringify(sent), /cross-provider-cipher/);
      if (provider === "GPT") assert.equal(sent.reasoning.summary, "auto");
      if (provider === "Claude")
        assert.equal(sent.thinking.display, "summarized");
      if (provider === "Gemini") {
        assert.equal(
          sent.generationConfig.thinkingConfig.includeThoughts,
          true,
        );
        assert.equal(result.usage.totalTokenCount, 10);
      }
    }
  } finally {
    globalThis.fetch = fetchBefore;
    for (const [name, value] of envBefore)
      value === undefined
        ? delete process.env[name]
        : (process.env[name] = value);
  }
});

test("OpenAI and Claude emit readable summaries before answer text, retaining native signatures", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "reasoning-fixture";
  try {
    const gpt = new OpenAIProvider({
      fetchImpl: async () =>
        sse([
          {
            type: "response.reasoning_summary_text.delta",
            output_index: 0,
            summary_index: 0,
            delta: "GPT rationale",
          },
          { type: "response.output_text.delta", delta: "Answer" },
          {
            type: "response.completed",
            response: {
              status: "completed",
              output: [
                {
                  type: "reasoning",
                  summary: [{ text: "GPT rationale" }],
                  encrypted_content: "cipher",
                },
                message("Answer"),
              ],
            },
          },
        ]),
    });
    const order = [];
    const result = await gpt.respond(
      { model: "gpt-6-luna" },
      {
        onDelta: (text) => order.push(text),
        onReasoning: (part) => order.push(part.delta),
      },
    );
    assert.deepEqual(order, ["GPT rationale", "Answer"]);
    assert.equal(result.output[0].encrypted_content, "cipher");
    const claude = new AnthropicProvider({
      apiKey: "fixture",
      fetchImpl: async () =>
        sse([
          {
            type: "message_start",
            message: { content: [], usage: { input_tokens: 2 } },
          },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "", signature: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "Claude rationale" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "signature_delta", signature: "signed" },
          },
          {
            type: "content_block_start",
            index: 1,
            content_block: { type: "text", text: "" },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { type: "text_delta", text: "Answer" },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 10 },
          },
          { type: "message_stop" },
        ]),
    });
    order.length = 0;
    const native = await claude.respond(
      { model: "claude-sonnet-5", input: [], max_output_tokens: 4096 },
      {
        onDelta: (text) => order.push(text),
        onReasoning: (part) => order.push(part.delta),
      },
    );
    assert.deepEqual(order, ["Claude rationale", "Answer"]);
    assert.equal(native.output[0].anthropic_content.signature, "signed");
    assert.equal(native.usage.output_tokens, 10);
  } finally {
    previous === undefined
      ? delete process.env.OPENAI_API_KEY
      : (process.env.OPENAI_API_KEY = previous);
  }
});

test("Claude restarts after workspace changes and preserves unchanged signed prefixes across service instances", async () => {
  const store = new Store(undefined, { memory: true });
  let calls = 0,
    previous;
  const rationale = "Rationale keyword source. ".repeat(240);
  const provider = new AnthropicProvider({
    apiKey: "fixture",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (previous && calls === 2) {
        assert.equal(body.system, previous.system);
        assert.deepEqual(body.tools, previous.tools);
        assert.deepEqual(
          body.messages.slice(0, previous.messages.length),
          previous.messages,
          "Every previously submitted message must be unchanged",
        );
      }
      if (previous && calls === 1) {
        assert.equal(body.messages.length, 1, 'Changed workspace starts a fresh chain');
        assert.match(JSON.stringify(body.messages), /completed_tool_results/);
        assert.doesNotMatch(JSON.stringify(body.messages), /signed-1/);
      }
      previous = structuredClone(body);
      calls++;
      const thinking = {
        type: "thinking",
        thinking: rationale,
        signature: "signed-" + calls,
      };
      const tool = (name, input, id) => ({
        type: "tool_use",
        name,
        input,
        id,
        caller: { type: "direct" },
      });
      const content =
        calls === 1
          ? [
              thinking,
              tool(
                "workspace_write",
                { path: "proof.md", content: "# Proof\nVerified." },
                "write",
              ),
            ]
          : calls === 2
            ? [
                thinking,
                tool("workspace_read", { path: "proof.md", offset: 0 }, "read"),
              ]
            : [thinking, { type: "text", text: "Verified file." }];
      return json({
        model: body.model,
        id: "response-" + calls,
        content,
        stop_reason: calls < 3 ? "tool_use" : "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    },
  });
  const service = () =>
    new ConclaveService(store, {
      availability: () => ({ anthropic: true }),
      providerFactory: () => provider,
    });
  const id = service().create().conversation_id;
  try {
    let view = await service().agentStart(id, {
      message_id: "objective",
      content: "Write and verify proof.",
      settings: { provider: "anthropic", model: "claude-sonnet-5", jev: false },
    });
    while (view.agent.status === "running")
      view = await service().agentStep(id, {
        run_id: view.agent.run_id,
        expected_step: view.agent.steps,
      });
    assert.equal(view.agent.status, "completed", view.agent.error);
    assert.equal(calls, 3);
    assert.equal(view.messages[0].reasoning.length, 3);
    assert.equal(view.messages[0].reasoning[0].run_id, view.agent.run_id);
    assert.equal(
      view.agent.output_tokens,
      60,
      "Summary characters do not double-count billed output",
    );
    const source = store.events(id).find((e) => e.kind === "reasoning");
    assert.equal(store.source(id, source.id).content, rationale);
    const h = service().harness(id, {
      provider: "openai",
      model: "gpt-6-luna",
    });
    const retrieved = h.toolResult(
      "retrieve_event",
      { event_id: source.id, offset: 0 },
      [],
    );
    assert.equal(retrieved.source_attribution.provider, "anthropic");
    assert.equal(retrieved.source_attribution.model, "claude-sonnet-5");
    assert.ok(retrieved.next_offset > 0);
    const range = h.toolResult(
      "retrieve_range",
      { start_seq: source.seq, end_seq: source.seq },
      [],
    );
    assert.equal(range.results[0].kind, "reasoning");
    assert.ok(
      store.searchChunks(id, "keyword").some((e) => e.event_id === source.id),
    );
    assert.doesNotMatch(JSON.stringify(h.input()), /signed-1/);
    const exported = downloadRecord(service(), id);
    assert.equal(exported.messages[0].reasoning[0].text, rationale);
    assert.ok(
      JSON.stringify(exported.context_layer.events).includes("signed-1"),
    );
    assert.ok(
      service()
        .activity(id)
        .history.items.some((e) => e.kind === "reasoning"),
    );
  } finally {
    store.close();
  }
});

test("ordinary streamed Gemini and Claude preserve signed parts and never emit thoughts as answer deltas", async () => {
  const fetchBefore = globalThis.fetch;
  const envBefore = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"].map((name) => [
    name,
    process.env[name],
  ]);
  for (const [name] of envBefore) process.env[name] = "fixture";
  try {
    for (const provider of ["Gemini", "Claude"]) {
      globalThis.fetch = async () =>
        provider === "Gemini"
          ? sse([
              {
                candidates: [
                  {
                    content: { parts: [{ thought: true, text: "Rationale" }] },
                  },
                ],
              },
              {
                candidates: [
                  {
                    finishReason: "STOP",
                    content: {
                      parts: [
                        { text: "Answer", thoughtSignature: "signed-answer" },
                      ],
                    },
                  },
                ],
                usageMetadata: { totalTokenCount: 10, thoughtsTokenCount: 4 },
              },
            ])
          : sse([
              {
                type: "message_start",
                message: { content: [], usage: { input_tokens: 2 } },
              },
              {
                type: "content_block_start",
                index: 0,
                content_block: {
                  type: "thinking",
                  thinking: "",
                  signature: "",
                },
              },
              {
                type: "content_block_delta",
                index: 0,
                delta: { type: "thinking_delta", thinking: "Rationale" },
              },
              {
                type: "content_block_delta",
                index: 0,
                delta: {
                  type: "signature_delta",
                  signature: "signed-thinking",
                },
              },
              {
                type: "content_block_start",
                index: 1,
                content_block: { type: "text", text: "" },
              },
              {
                type: "content_block_delta",
                index: 1,
                delta: { type: "text_delta", text: "Answer" },
              },
              {
                type: "message_delta",
                delta: { stop_reason: "end_turn" },
                usage: { output_tokens: 8 },
              },
              { type: "message_stop" },
            ]);
      const order = [];
      const result = await chat(
        {
          provider,
          model:
            provider === "Gemini"
              ? "gemini-3.1-pro-preview"
              : "claude-sonnet-5",
          messages: [{ role: "user", content: "Answer" }],
        },
        (delta) => order.push(["answer", delta]),
        undefined,
        { onReasoning: (part) => order.push(["reasoning", part.delta]) },
      );
      assert.deepEqual(order, [
        ["reasoning", "Rationale"],
        ["answer", "Answer"],
      ]);
      assert.equal(result.text, "Answer");
      assert.equal(result.reasoning.text, "Rationale");
      assert.equal(result.provenance.native_output.length, 2);
      assert.match(JSON.stringify(result.provenance.native_output), /signed-/);
    }
  } finally {
    globalThis.fetch = fetchBefore;
    for (const [name, value] of envBefore)
      value === undefined
        ? delete process.env[name]
        : (process.env[name] = value);
  }
});

test("ordinary interrupted GPT summaries keep partial status, native output and reported usage", async () => {
  const before = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture";
  globalThis.fetch = async () =>
    sse([
      {
        type: "response.created",
        response: {
          id: "partial-id",
          model: "gpt-6-luna",
          usage: { input_tokens: 2, output_tokens: 1 },
        },
      },
      {
        type: "response.reasoning_summary_text.delta",
        output_index: 0,
        summary_index: 0,
        delta: "Unfinished thought",
      },
    ]);
  try {
    await assert.rejects(
      () =>
        chat(
          {
            provider: "GPT",
            model: "gpt-6-luna",
            messages: [{ role: "user", content: "Answer" }],
          },
          () => {},
          undefined,
          { onReasoning() {} },
        ),
      (error) => {
        assert.equal(error.reasoning.text, "Unfinished thought");
        assert.equal(error.reasoning.status, "partial");
        assert.equal(error.provenance.response_id, "partial-id");
        assert.equal(
          error.provenance.native_output[0].summary[0].text,
          "Unfinished thought",
        );
        assert.equal(error.usage.output_tokens, 1);
        return /unexpectedly/.test(error.message);
      },
    );
  } finally {
    globalThis.fetch = before;
    key === undefined
      ? delete process.env.OPENAI_API_KEY
      : (process.env.OPENAI_API_KEY = key);
  }
});

test("legacy opaque reasoning is displayed without creating or rewriting historical events", () => {
  const store = new Store(undefined, { memory: true });
  const service = new ConclaveService(store, { availability: () => ({}) });
  const id = service.create().conversation_id;
  try {
    store.append(id, "user", "Old question");
    const request = store.append(id, "inference_request", "answer", {
      provider: "openai",
      payload: { model: "gpt-6-luna" },
    });
    store.append(
      id,
      "inference_response",
      "answer",
      {
        request_id: request.id,
        output: [{ type: "reasoning", encrypted_content: "legacy-cipher" }],
        status: "incomplete",
      },
      "openai",
    );
    const before = store.events(id);
    const record = service.view(id).messages[0].reasoning[0];
    assert.equal(record.text, "");
    assert.equal(record.opaque_available, true);
    assert.equal(record.status, "incomplete");
    assert.doesNotMatch(JSON.stringify(record), /legacy-cipher/);
    assert.deepEqual(store.events(id), before);
  } finally {
    store.close();
  }
});

test("a signed continuation stops at budget without changing earlier inputs or tool results", () => {
  const store = new Store(undefined, { memory: true });
  const id = store.create("Budget");
  const h = new Harness(
    store,
    id,
    { name: "anthropic" },
    { model: "claude-sonnet-5", budget: 64000, output: 4096 },
  );
  try {
    h.addMessage("user", "Continue");
    h.prepareAnswer([], []);
    const frozen = structuredClone(h.continuation);
    h.options.budget = 5000;
    assert.throws(
      () =>
        h.prepareAnswer(
          [
            {
              type: "function_call_output",
              call_id: "read",
              output: "x".repeat(20000),
            },
          ],
          [],
        ),
      /Request byte guard exceeded/,
    );
    assert.deepEqual(h.continuation, frozen);
  } finally {
    store.close();
  }
});

test("interrupted thinking is saved and displayed as partial even without a final assistant reply", async () => {
  const store = new Store(undefined, { memory: true });
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true }),
    providerFactory: () => ({
      name: "openai",
      respond: async (_p, options) => {
        options.onReasoning({ delta: "Unfinished rationale", block: "0" });
        throw Error("Connection ended");
      },
    }),
  });
  const id = service.create().conversation_id;
  try {
    await assert.rejects(
      () =>
        service.ask(
          id,
          {
            message_id: "question",
            content: "Answer",
            settings: { jev: false },
          },
          { onEvent() {} },
        ),
      /Connection ended/,
    );
    const view = service.view(id);
    assert.equal(view.messages.length, 1);
    assert.equal(view.messages[0].reasoning[0].text, "Unfinished rationale");
    assert.equal(view.messages[0].reasoning[0].status, "partial");
    assert.equal(
      store.events(id).filter((e) => e.kind === "reasoning").length,
      1,
    );
  } finally {
    store.close();
  }
});
