import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  OpenAIProvider,
  AnthropicProvider,
  responseText,
} from "../lib/conclave/provider.js";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
import { createContextHandler } from "../lib/conclave-http.js";
import { session } from "../lib/access.js";

const message = (text) => ({
  type: "message",
  content: [{ type: "output_text", text }],
});
const completed = (text = "Hello 🌱") => ({
  status: "completed",
  id: "resp_fixture",
  model: "fixture",
  usage: { input_tokens: 12, output_tokens: 4 },
  output: [message(text)],
});
function sse(events) {
  const bytes = new TextEncoder().encode(
    events
      .map(
        (event) =>
          "event: ignored\r\ndata: " + JSON.stringify(event) + "\r\n\r\n",
      )
      .join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split even within Unicode code points and CRLF separators.
        for (let n = 0; n < bytes.length; n += 7)
          controller.enqueue(bytes.slice(n, n + 7));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

test("OpenAI streams text and refusals while preserving final tool/reasoning/usage records; EOF is not completion", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "stream-fixture";
  try {
    let sent;
    const final = {
      ...completed(),
      output: [
        message("Hello 🌱"),
        { type: "reasoning", encrypted_content: "opaque" },
        {
          type: "function_call",
          call_id: "call_1",
          name: "calculate",
          arguments: '{"operation":"sum","values":[1,2]}',
        },
      ],
    };
    const provider = new OpenAIProvider({
      fetchImpl: async (_url, options) => {
        sent = JSON.parse(options.body);
        return sse([
          { type: "response.output_text.delta", delta: "Hello " },
          { type: "response.refusal.delta", delta: "🌱" },
          { type: "response.completed", response: final },
        ]);
      },
    });
    const deltas = [];
    assert.deepEqual(
      await provider.respond(
        { model: "fixture", input: [] },
        { onDelta: (delta) => deltas.push(delta) },
      ),
      final,
    );
    assert.equal(sent.stream, true);
    assert.equal(deltas.join(""), "Hello 🌱");
    provider.fetch = async () =>
      sse([{ type: "response.output_text.delta", delta: "partial" }]);
    await assert.rejects(
      provider.respond({}, { onDelta() {} }),
      /ended unexpectedly/,
    );
    const incomplete = {
      ...final,
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    };
    provider.fetch = async () =>
      sse([{ type: "response.incomplete", response: incomplete }]);
    assert.deepEqual(await provider.respond({}, { onDelta() {} }), incomplete);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("Claude streams text only and reconstructs signed thinking, split tool JSON, cache usage and stop reasons", async () => {
  let sent;
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_fixture",
        model: "claude-fixture",
        content: [],
        usage: {
          input_tokens: 10,
          output_tokens: 1,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 5,
        },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "", signature: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "private reasoning" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "signed" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "Hello 🌱" },
    },
    { type: "content_block_stop", index: 1 },
    {
      type: "content_block_start",
      index: 2,
      content_block: {
        type: "tool_use",
        id: "call_a",
        name: "calculate",
        input: {},
      },
    },
    {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: '{"values":' },
    },
    {
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: "[1,2]}" },
    },
    { type: "content_block_stop", index: 2 },
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { output_tokens: 4 },
    },
    { type: "message_stop" },
  ];
  const provider = new AnthropicProvider({
    apiKey: "stream-fixture",
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return sse(events);
    },
  });
  const deltas = [];
  const result = await provider.respond(
    { model: "claude-fixture", input: [], max_output_tokens: 1024 },
    { onDelta: (delta) => deltas.push(delta) },
  );
  assert.equal(sent.stream, true);
  assert.equal(result.status, "completed");
  assert.equal(deltas.join(""), "Hello 🌱");
  assert.equal(responseText(result), "Hello 🌱");
  assert.equal(result.output[0].anthropic_content.signature, "signed");
  assert.deepEqual(JSON.parse(result.output[2].arguments), { values: [1, 2] });
  assert.equal(result.usage.input_tokens, 35);
  assert.equal(result.usage.output_tokens, 4);
  provider.fetch = async () => sse(events.slice(0, -1));
  await assert.rejects(
    provider.respond({ input: [] }, { onDelta() {} }),
    /ended unexpectedly/,
  );
  provider.fetch = async () =>
    sse([{ type: "error", error: { message: "stream-fixture rejected" } }]);
  await assert.rejects(
    provider.respond({ input: [] }, { onDelta() {} }),
    /\[redacted\] rejected/,
  );
});

test("authenticated Context HTTP delivers deltas before completion, saves only final answer and records truncation", async () => {
  const oldPassword = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = "stream-test-password";
  const store = new Store(undefined, { memory: true });
  let release,
    fail = false;
  const gate = new Promise((resolve) => (release = resolve));
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, jev: false }),
    providerFactory: () => ({
      name: "openai",
      respond: async (_payload, { onDelta }) => {
        onDelta("Hello 🌱");
        await gate;
        if (fail) throw Error("response stream ended unexpectedly");
        return completed();
      },
    }),
  });
  const handler = createContextHandler(service);
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/conclave`;
  const id = service.create().conversation_id;
  const options = (message_id) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "converse_session=" + session(),
    },
    body: JSON.stringify({
      action: "ask",
      stream: true,
      conversation_id: id,
      message_id,
      content: "Hi",
      settings: { model: "fixture", jev: false },
    }),
  });
  try {
    const unauthorized = await fetch(url, {
      ...options("unauthorized"),
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(unauthorized.status, 401);
    const reply = await fetch(url, options("first"));
    assert.match(reply.headers.get("Content-Type"), /ndjson/);
    const reader = reply.body.getReader();
    let text = "";
    while (!text.includes("Hello"))
      text += new TextDecoder().decode((await reader.read()).value);
    assert.match(text, /"type":"start"/);
    assert.equal(
      service.view(id).messages.filter((m) => m.role === "assistant").length,
      0,
    );
    release();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    const events = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(events.at(-1).done, true);
    assert.equal(events.at(-1).view.messages[1].content, "Hello 🌱");
    assert.equal(service.view(id).messages[1].usage.output_tokens, 4);
    fail = true;
    const failure = await (await fetch(url, options("second"))).text();
    assert.match(failure, /"error":/);
    assert.equal(
      service.view(id).messages.filter((m) => m.role === "assistant").length,
      1,
    );
    assert.equal(service.view(id).messages.at(-1).answer_failed, true);
  } finally {
    release();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    store.close();
    if (oldPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = oldPassword;
  }
});
