import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Store } from "../lib/conclave/store.js";
import { ConclaveService } from "../lib/conclave/service.js";

// One opt-in paid compaction call, using isolated synthetic source history.
if (!process.argv.includes("--live")) {
  console.log(
    "Use --live --model=YOUR_CLAUDE_MODEL_ID for a one-call native compaction proof.",
  );
  process.exit(0);
}
const model = process.argv.find((arg) => arg.startsWith("--model="))?.slice(8);
if (!model) throw Error("Supply --model=YOUR_CLAUDE_MODEL_ID");
const directory = new URL("../.agent-smoke/claude-context/", import.meta.url);
mkdirSync(directory, { recursive: true });
const store = new Store(fileURLToPath(directory));
try {
  const service = new ConclaveService(store);
  const id = service.create("Claude compaction proof").conversation_id;
  const h = service.harness(
    id,
    {
      provider: "anthropic",
      model,
      reasoning: "none",
      budget: 64000,
      output: 2048,
      jev: false,
    },
    true,
  );
  for (let n = 0; n < 6; n++)
    h.addMessage(
      "user",
      `Workshop note ${n}: ` +
        "The workshop has 12 participants and a budget of 100 dollars. Keep two adults present. The venue is undecided; do not invent confirmation. ".repeat(
          14,
        ),
    );
  for (let n = 0; n < 4; n++)
    h.addMessage("user", `Recent note ${n}: keep the original constraints.`);
  const before = store.context(id);
  const result = await h.compact([], true);
  const after = store.context(id);
  const audit = service.export(id);
  assert.equal(result.status, "compacted");
  assert.ok(after.revision > before.revision);
  assert.ok(
    after.segments.some(
      (s) => s.type === "summary" || s.parent_bundle_ids?.length,
    ),
  );
  const request = audit.events.find(
    (e) => e.kind === "inference_request" && e.content === "compaction",
  );
  assert.equal(request.metadata.provider, "anthropic");
  assert.equal(
    request.metadata.provider_payload.output_config.format.type,
    "json_schema",
  );
  assert.equal(
    audit.events.filter((e) => e.kind === "inference_request").length,
    1,
  );
  writeFileSync(
    new URL("latest.json", directory),
    JSON.stringify({ result, before, after, audit }, null, 2),
  );
  console.log(
    JSON.stringify({
      model,
      status: result.status,
      before_revision: before.revision,
      after_revision: after.revision,
      before_bytes: Buffer.byteLength(JSON.stringify(before.segments)),
      after_bytes: Buffer.byteLength(JSON.stringify(after.segments)),
      input_tokens: h.metrics().input_tokens,
      output_tokens: h.metrics().output_tokens,
      audit: ".agent-smoke/claude-context/latest.json",
    }),
  );
} finally {
  store.close();
}
