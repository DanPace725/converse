import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/models.js";
import { session } from "../lib/access.js";
import { chat, models } from "../lib/providers.js";

function fixtures(t) {
  for (const key of [
    "APP_PASSWORD",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
  ]) {
    const previous = process.env[key];
    process.env[key] = "catalog-fixture";
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}
const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function catalog() {
  const res = {
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.data = JSON.parse(body);
    },
  };
  await handler(
    { method: "GET", headers: { cookie: "converse_session=" + session() } },
    res,
  );
  assert.equal(res.status, 200);
  return res.data;
}

test("model catalog exposes Claude options without message stop reasons, including subsequent pages", async (t) => {
  fixtures(t);
  const paths = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    const { hostname, pathname, searchParams } = new URL(url);
    if (hostname === "api.openai.com")
      return reply({ data: [{ id: "gpt-fixture", created: 1 }] });
    if (hostname === "generativelanguage.googleapis.com")
      return reply({
        models: [
          {
            name: "models/gemini-3-fixture",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    assert.equal(hostname, "api.anthropic.com");
    assert.equal(pathname, "/v1/models");
    assert.equal(options.headers["anthropic-version"], "2023-06-01");
    paths.push(searchParams.get("after_id"));
    const next = searchParams.has("after_id");
    return reply({
      data: [
        {
          id: next ? "claude-older" : "claude-newer",
          created_at: next ? "2025-01-01T00:00:00Z" : "2026-01-01T00:00:00Z",
        },
      ],
      has_more: !next,
      last_id: next ? "claude-older" : "claude-newer",
    });
  });
  const data = await catalog();
  assert.deepEqual(data.Claude, { models: ["claude-newer", "claude-older"] });
  assert.deepEqual(data.GPT.models, ["gpt-fixture"]);
  assert.deepEqual(data.Gemini.models, ["gemini-3-fixture"]);
  assert.deepEqual(paths, [null, "claude-newer"]);
});

test("model catalog still surfaces and redacts actual provider errors", async (t) => {
  fixtures(t);
  t.mock.method(globalThis, "fetch", async (url) => {
    if (new URL(url).hostname === "api.anthropic.com")
      return reply({ error: { message: "catalog-fixture rejected" } }, 401);
    return reply({ data: [], models: [] });
  });
  assert.deepEqual((await catalog()).Claude, {
    models: [],
    error: "Claude: 401 — [redacted] rejected",
  });
});

test("Claude chat still rejects missing or truncated stop reasons and accepts completed answers", async (t) => {
  fixtures(t);
  let stopReason;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).pathname, "/v1/messages");
    assert.equal(options.method, "POST");
    return reply({
      id: "msg_fixture",
      model: "claude-fixture",
      content: [{ type: "text", text: "Answer" }],
      usage: { input_tokens: 10, output_tokens: 2 },
      ...(stopReason ? { stop_reason: stopReason } : {}),
    });
  });
  const request = {
    provider: "Claude",
    model: "claude-fixture",
    messages: [{ role: "user", content: "Hello" }],
  };
  await assert.rejects(chat(request), /Provider stopped.*undefined/);
  stopReason = "max_tokens";
  await assert.rejects(chat(request), /Provider stopped.*max_tokens/);
  stopReason = "end_turn";
  assert.equal((await chat(request)).text, "Answer");
});
