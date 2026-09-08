import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
process.env.OPENAI_API_KEY = "test-key";
process.env.APP_PASSWORD = "test-password";
const { chat } = await import("../lib/providers.js");
const { guard, session } = await import("../lib/access.js");
function response() {
  const r = new EventEmitter();
  r.writeHead = (s) => (r.status = s);
  r.end = () => {};
  return r;
}
test("access rejects missing session and accepts signed cookie", () => {
  let r = response();
  assert.equal(guard({ headers: {} }, r), false);
  assert.equal(r.status, 401);
  assert.equal(
    guard({ headers: { cookie: "converse_session=" + session() } }, response()),
    true,
  );
  assert.equal(
    guard({ headers: { cookie: "converse_session=1.fake" } }, response()),
    false,
  );
});
test("origin protection rejects foreign origins", () => {
  assert.equal(
    guard(
      {
        headers: {
          host: "localhost",
          origin: "https://evil.example",
          cookie: "converse_session=" + session(),
        },
      },
      response(),
    ),
    false,
  );
});
test("stream parser handles split events and preserves speaker ownership", async () => {
  const original = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = JSON.parse(options.body);
    const data = [
      'data: {"type":"response.output_text.delta","delta":"Hi"}\r\n\r',
      '\ndata: {"type":"response.output_text.delta","delta":" there"}\n\ndata: {"type":"response.completed","response":{"id":"resp_123","model":"gpt-exact","usage":{"input_tokens":123,"output_tokens":7}}}\n\n',
    ];
    return new Response(
      new ReadableStream({
        start(c) {
          for (const d of data) c.enqueue(new TextEncoder().encode(d));
          c.close();
        },
      }),
    );
  };
  try {
    let text = "";
    const result = await chat(
      {
        provider: "GPT",
        model: "gpt-4o-2024-11-20",
        messages: [
          { role: "user", content: "Hi" },
          {
            role: "assistant",
            provider: "Claude",
            model: "claude-sonnet-5",
            content: "Hello",
          },
          { role: "user", content: "Who said hello?" },
        ],
      },
      (s) => (text += s),
    );
    assert.equal(text, "Hi there");
    assert.equal(result.usage.input_tokens, 123);
    assert.equal(result.provenance.reported_model, "gpt-exact");
    assert.equal(result.provenance.system_prompt, sent.instructions);
    assert.equal(sent.model, "gpt-4o-2024-11-20");
    assert.equal(sent.input[1].role, "user");
    assert.match(sent.input[1].content, /Claude/);
  } finally {
    globalThis.fetch = original;
  }
});
test("truncated streams fail instead of claiming success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
    );
  try {
    await assert.rejects(
      () =>
        chat(
          {
            provider: "GPT",
            model: "gpt-4o-2024-11-20",
            messages: [{ role: "user", content: "Hi" }],
          },
          () => {},
        ),
      /unexpectedly/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("request body preserves Unicode split across byte chunks", async () => {
  const { body } = await import("../lib/access.js");
  const bytes = Buffer.from(JSON.stringify({ content: "Hello 🌍 中文" }));
  const boundary = bytes.indexOf(Buffer.from("🌍")) + 2;
  const req = {
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield bytes.subarray(0, boundary);
      yield bytes.subarray(boundary);
    },
  };
  assert.deepEqual(await body(req), { content: "Hello 🌍 中文" });
});
test("request body rejects nonobjects and oversized multibyte JSON", async () => {
  const { body } = await import("../lib/access.js");
  await assert.rejects(
    () =>
      body({ headers: { "content-type": "application/json" }, body: "null" }),
    /object/,
  );
  await assert.rejects(
    () =>
      body({
        headers: { "content-type": "application/json" },
        body: { content: "中".repeat(400000) },
      }),
    /large/,
  );
});
test("invalid message records fail with a validation error", async () => {
  await assert.rejects(
    () =>
      chat(
        { provider: "GPT", model: "gpt-4o-2024-11-20", messages: [null] },
        () => {},
      ),
    /Invalid chat request/,
  );
});
