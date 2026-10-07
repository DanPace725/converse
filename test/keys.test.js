import test from "node:test";
import assert from "node:assert/strict";
import { chat, models, redact } from "../lib/providers.js";
import { conversationTitle } from "../lib/titles.js";
import { requestKeys } from "../lib/keys.js";
import keysHandler from "../api/keys.js";
import { session } from "../lib/access.js";

const names = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "APP_PASSWORD",
  "SESSION_SECRET",
  "ALLOWED_EMAILS",
  "KEY_ENCRYPTION_SECRET",
  "DATABASE_URL",
];
// The deployment's own keys are present throughout: an own-key request must
// never reach for them.
function fixtures(t, values = {}) {
  const environment = {
    OPENAI_API_KEY: "deployment-openai",
    ANTHROPIC_API_KEY: "deployment-anthropic",
    GEMINI_API_KEY: "deployment-gemini",
    ...values,
  };
  const before = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  for (const name of names)
    if (environment[name] === undefined) delete process.env[name];
    else process.env[name] = environment[name];
  const fetchBefore = globalThis.fetch,
    requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers });
    const text = "Paid for by the caller.";
    return new Response(
      JSON.stringify(
        String(url).includes("openai.com")
          ? String(url).endsWith("/models")
            ? { data: [{ id: "gpt-fixture", created: 1 }] }
            : {
                status: "completed",
                output: [
                  { type: "message", content: [{ type: "output_text", text }] },
                ],
              }
          : String(url).includes("anthropic.com")
            ? { stop_reason: "end_turn", content: [{ type: "text", text }] }
            : {
                candidates: [
                  { finishReason: "STOP", content: { parts: [{ text }] } },
                ],
              },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  t.after(() => {
    globalThis.fetch = fetchBefore;
    for (const name of names)
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
  });
  return requests;
}
const ask = (provider, model, keys) =>
  chat(
    { provider, model, messages: [{ role: "user", content: "Hello" }] },
    null,
    undefined,
    { keys, includeAppGuide: false },
  );

test("Chat spends the caller's own key for each provider and never the deployment key", async (t) => {
  const requests = fixtures(t);
  const keys = {
    openai: "own-openai",
    anthropic: "own-anthropic",
    gemini: "own-gemini",
  };
  for (const [provider, model] of [
    ["GPT", "gpt-fixture"],
    ["Claude", "claude-fixture"],
    ["Gemini", "gemini-fixture"],
  ])
    assert.equal(
      (await ask(provider, model, keys)).text,
      "Paid for by the caller.",
    );
  assert.deepEqual(
    requests.map(
      (r) =>
        r.headers.Authorization ||
        r.headers["x-api-key"] ||
        r.headers["x-goog-api-key"],
    ),
    ["Bearer own-openai", "own-anthropic", "own-gemini"],
  );
  assert.deepEqual(await models("GPT", keys), ["gpt-fixture"]);
  assert.equal(requests.at(-1).headers.Authorization, "Bearer own-openai");
  const title = await conversationTitle(
    { provider: "Claude", model: "claude-fixture", content: "Octopus care" },
    { keys },
  );
  assert.equal(title.title, "Paid for by the caller.");
  assert.equal(requests.at(-1).headers["x-api-key"], "own-anthropic");
});

test("a provider without a saved key is refused before any request is made", async (t) => {
  const requests = fixtures(t);
  for (const [provider, model, label] of [
    ["GPT", "gpt-fixture", "OpenAI"],
    ["Claude", "claude-fixture", "Anthropic"],
    ["Gemini", "gemini-fixture", "Google Gemini"],
  ])
    await assert.rejects(
      ask(provider, model, { jev: "unrelated" }),
      new RegExp(`No ${label} API key is saved for your account`),
    );
  await assert.rejects(models("Claude", {}), /No Anthropic API key is saved/);
  assert.deepEqual(requests, []);
  // Without a key map the deployment's environment is used, as before.
  await ask("GPT", "gpt-fixture");
  assert.equal(requests[0].headers.Authorization, "Bearer deployment-openai");
  assert.equal(
    redact(Error("refused own-openai and deployment-anthropic"), {
      openai: "own-openai",
    }),
    "refused [redacted] and [redacted]",
  );
});

test("personal keys are off without the secret and sign-in, with no database read", async (t) => {
  fixtures(t, { APP_PASSWORD: "fixture-password" });
  const req = {
    method: "GET",
    headers: { cookie: "converse_session=" + session() },
  };
  // DATABASE_URL is unset: reaching for the database would throw.
  assert.equal(await requestKeys(req), undefined);
  const res = {
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
  await keysHandler(req, res);
  assert.deepEqual([res.status, res.body], [200, { enabled: false, providers: [] }]);
  process.env.KEY_ENCRYPTION_SECRET = "fixture-key-encryption-secret-0123456789";
  assert.equal(await requestKeys(req), undefined);
});
