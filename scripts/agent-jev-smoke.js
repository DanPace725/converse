import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";
if (!process.argv.includes("--live")) {
  console.log("Opt-in native Jev + GPT agent check: --live");
  process.exit(0);
}
const directory = new URL("../.agent-smoke/jev-review/", import.meta.url);
mkdirSync(directory, { recursive: true });
const store = new Store(fileURLToPath(directory));
try {
  const service = new ConclaveService(store);
  assert.ok(
    service.status().credentials.jev,
    "Jev credential required for native selection check",
  );
  const id = service.create(
      "Synthetic Jev agent context-pressure check",
    ).conversation_id,
    h = service.harness(id);
  for (let n = 0; n < 5; n++)
    h.addMessage(
      "assistant",
      (
        "Superseded synthetic planning draft " +
        n +
        ". This repetitive historical draft is obsolete; retain a retrieval pointer if needed. "
      ).repeat(85),
      { status: "superseded" },
    );
  for (let n = 0; n < 4; n++)
    h.addMessage(
      "assistant",
      "Recent synthetic checkpoint " + n + ". There are no outstanding tasks.",
    );
  let view = await service.agentStart(id, {
    message_id: "msg_jev_" + Date.now(),
    content:
      "Synthetic smoke test only. The older drafts are obsolete. Reply briefly that the test is complete; no files or calculations are needed.",
    settings: {
      model: "gpt-6-luna",
      reasoning: "low",
      budget: 64000,
      output: 4096,
    },
    limits: { max_steps: 4, duration_seconds: 180, max_total_tokens: 100000 },
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
        decisions: view.metrics.decision_calls,
        compactions: view.metrics.compaction_calls,
        error: view.agent.error,
      }),
    );
  }
  const audit = service.export(id);
  writeFileSync(
    new URL("latest.json", directory),
    JSON.stringify({ view, audit }, null, 2),
  );
  assert.equal(view.agent.status, "completed", view.agent.error);
  assert.ok(view.metrics.decision_calls > 0, "No native Jev call");
  assert.ok(
    audit.events.some(
      (e) =>
        e.kind === "decision_proposal" &&
        e.metadata.selection_source === "bounded-model",
    ),
    "No validated native Jev decision",
  );
  console.log(
    JSON.stringify({
      conversation_id: id,
      metrics: view.metrics,
      input_tokens: view.agent.input_tokens,
      output_tokens: view.agent.output_tokens,
      answer: view.messages.at(-1).content,
    }),
  );
} finally {
  store.close();
}
