import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";

// Opt-in live proof, isolated from existing chats and independent of DATABASE_URL.
if (!process.argv.includes("--live")) {
  console.log(
    "Run node scripts/agent-smoke.js --live to test the real provider (up to 8 calls).",
  );
  process.exit(0);
}
const directory = new URL("../.agent-smoke/", import.meta.url);
mkdirSync(directory, { recursive: true });
const store = new Store(directory.pathname.replace(/^\/(\w:)/, "$1"));
try {
  const service = new ConclaveService(store);
  const id = service.create("Agent live proof").conversation_id;
  let view = await service.agentStart(id, {
    message_id: "msg_live_" + Date.now(),
    content:
      "Use calculate to multiply 17 by 23. Write the result and a short explanation to proof.md with workspace_write. Read proof.md back with workspace_read to verify it, then give your final report. Do not stop before those three tools have succeeded.",
    settings: {
      model: process.env.CONCLAVE_MODEL || "gpt-6-luna",
      reasoning: "low",
    },
    limits: { max_steps: 8, duration_seconds: 240, max_total_tokens: 150000 },
  });
  while (view.agent.status === "running") {
    view = await service.agentStep(id, {
      run_id: view.agent.run_id,
      expected_step: view.agent.steps,
    });
    console.log(
      JSON.stringify({
        status: view.agent.status,
        steps: view.agent.steps,
        tools: view.agent.tools.map((t) => t.name),
      }),
    );
  }
  const audit = service.export(id);
  writeFileSync(
    new URL("latest.json", directory),
    JSON.stringify({ view, audit }, null, 2),
  );
  assert.equal(view.agent.status, "completed", view.agent.error);
  assert.ok(
    view.agent.files
      .find((f) => f.path === "proof.md")
      ?.content.includes("391"),
  );
  for (const name of ["calculate", "workspace_write", "workspace_read"])
    assert.ok(
      view.agent.tools.some((t) => t.name === name),
      `Missing ${name}`,
    );
  console.log(
    JSON.stringify({
      conversation_id: id,
      input_tokens: view.agent.input_tokens,
      output_tokens: view.agent.output_tokens,
      answer: view.messages.at(-1).content,
      audit: ".agent-smoke/latest.json",
    }),
  );
} finally {
  store.close();
}
