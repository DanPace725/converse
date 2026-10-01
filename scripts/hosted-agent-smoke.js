import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// Opt-in live check: creates a new hosted chat and spends provider tokens.
// Credentials/cookies stay in memory. Only this chat's audit is written to disk.
if (!process.argv.includes("--live")) {
  console.log(
    "Set APP_PASSWORD and run node scripts/hosted-agent-smoke.js --live.",
  );
  process.exit(0);
}
assert.ok(process.env.APP_PASSWORD, "APP_PASSWORD is required");
const origin = new URL(
  process.env.CONVERSE_TEST_ORIGIN || "https://converse-cyan.vercel.app",
);
assert.equal(origin.protocol, "https:");
assert.equal(origin.pathname, "/");
assert.ok(
  !origin.username && !origin.password && !origin.search && !origin.hash,
);
const directory = new URL("../.agent-smoke/hosted/", import.meta.url);
await mkdir(directory, { recursive: true });
const localPath = (name) =>
  new URL(name, directory).pathname.replace(/^\/(\w:)/, "$1");
const browser = await chromium.launch({
  channel: process.env.CONVERSE_TEST_BROWSER || "msedge",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const original =
  "# Hosted proof\n\nCalculation: 17 * 23 = 391.\n\nVerification: pending.\n";
let conversation;
const get = async (action) => {
  const response = await context.request.get(
    new URL(
      "/api/conclave?action=" +
        action +
        (conversation ? "&conversation=" + conversation : ""),
      origin,
    ).href,
  );
  assert.ok(response.ok(), "GET " + action + ": " + response.status());
  return response.json();
};
const post = (data) =>
  context.request.post(new URL("/api/conclave", origin).href, {
    headers: { Origin: origin.origin },
    data,
  });
try {
  await page.goto(origin.href);
  await page.getByLabel("Access password").fill(process.env.APP_PASSWORD);
  await page.locator("#unlock-form").getByRole("button").click();
  await expect(page.locator("#unlock")).not.toBeVisible();
  await expect(page.locator("#mode-switch")).toBeVisible();
  const status = await get("status");
  assert.equal(status.available, true);
  assert.equal(status.credentials.openai, true);
  assert.equal(status.credentials.jev, true);
  assert.equal(status.defaults.jev, true);
  assert.equal(status.defaults.budget, 256000);
  assert.equal(status.defaults.output, 16384);
  console.log(JSON.stringify({ phase: "authenticated", status }));
  const creation = await post({
    action: "create",
    title: "Hosted integration proof " + new Date().toISOString(),
  });
  assert.equal(creation.status(), 201);
  conversation = (await creation.json()).conversation_id;
  await page.reload();
  await page
    .locator('#server-chats button[data-id="' + conversation + '"]')
    .click();
  await page.getByRole("radio", { name: "Agent", exact: true }).check();
  await page.locator("#context-panel > summary").click();
  await expect(page.locator("#context-jev")).toBeChecked();
  await page.locator("#agent-panel > summary").click();
  await expect(page.locator("#agent-budget")).toHaveValue("256000");
  await expect(page.locator("#agent-output")).toHaveValue("16384");
  await page.locator("#agent-minutes").fill("3");
  await page.locator("#agent-steps").fill("8");
  await page.locator("#agent-tokens").fill("75000");
  await page.locator("#sheet-close").click();
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "Use calculate to multiply 17 by 23. With workspace_write create hosted-proof.md containing exactly the following Markdown (including the final newline):\n" +
        original +
        "\nRead the saved file back completely with workspace_read, then give a brief final report. Do not finish until all these tools have succeeded.",
    );
  await page.locator("#send").click();
  await expect(page.locator("#run-progress")).toContainText(
    /Model working|Calculating|Saving|Reading|Preparing/,
    { timeout: 30000 },
  );
  await expect(page.locator("#context-garden")).not.toBeVisible();
  await page.screenshot({ path: localPath("agent-working.png") });
  console.log(
    JSON.stringify({
      phase: "agent_running",
      conversation_id: conversation,
      garden_closed: true,
    }),
  );
  await expect(page.locator("#agent-status")).toContainText("completed", {
    timeout: 210000,
  });
  const agentView = await get("view");
  assert.equal(agentView.agent.status, "completed");
  for (const tool of ["calculate", "workspace_write", "workspace_read"])
    assert.ok(
      agentView.agent.tools.some((t) => t.name === tool),
      "Missing " + tool,
    );
  const file = agentView.workspace.find((f) => f.path === "hosted-proof.md");
  assert.equal(file.content, original);
  const before = await get("export");
  const retry = await post({
    action: "agent_step",
    conversation_id: conversation,
    run_id: agentView.agent.run_id,
    expected_step: 0,
  });
  assert.equal(retry.status(), 200);
  assert.equal(
    (await get("export")).events.filter((e) => e.kind === "inference_request")
      .length,
    before.events.filter((e) => e.kind === "inference_request").length,
  );
  console.log(
    JSON.stringify({
      phase: "agent_completed",
      steps: agentView.agent.steps,
      metrics: agentView.metrics,
      retry_added_inference: false,
    }),
  );
  await page.getByRole("radio", { name: "Context", exact: true }).check();
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      'Read hosted-proof.md completely, use workspace_patch to replace exactly "Verification: pending." with "Verification: passed.", preserve all other content, read the saved current version back completely, then briefly report.',
    );
  await page.locator("#send").click();
  await expect(page.locator("#send")).toBeEnabled({ timeout: 210000 });
  const editedView = await get("view");
  const edited = editedView.workspace.find((f) => f.path === "hosted-proof.md");
  assert.equal(
    edited.content,
    original.replace("Verification: pending.", "Verification: passed."),
  );
  assert.notEqual(edited.source_event_id, file.source_event_id);
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Context", exact: true }),
  ).toBeChecked();
  await expect(page.locator("#workspace-panel")).toBeVisible();
  await page.locator("#workspace-panel > summary").click();
  const filePending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download hosted-proof.md" }).click();
  const downloadedFile = await filePending;
  assert.equal(
    await readFile(await downloadedFile.path(), "utf8"),
    edited.content,
  );
  await downloadedFile.saveAs(localPath("hosted-proof.md"));
  const jsonPending = page.waitForEvent("download");
  await page.locator("#more-menu > summary").click();
  await page.locator("#export-json").click();
  const downloadedJson = await jsonPending;
  const record = JSON.parse(
    await readFile(await downloadedJson.path(), "utf8"),
  );
  assert.equal(record.conversation_id, conversation);
  const audit = record.context_layer;
  await downloadedJson.saveAs(localPath("audit.json"));
  assert.ok(audit.events.some((e) => e.kind === "agent_checkpoint"));
  assert.ok(
    audit.events.some((e) => e.kind === "document" && e.content === original),
  );
  assert.ok(
    audit.events.some(
      (e) => e.kind === "document" && e.content === edited.content,
    ),
  );
  assert.ok(audit.events.some((e) => e.kind === "workspace_read"));
  assert.ok(audit.metrics.workspace_readbacks >= 2);
  assert.equal(audit.metrics.usage_complete, true);
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: localPath("context-edited.png"),
    fullPage: true,
  });
  const result = {
    verified_at: new Date().toISOString(),
    origin: origin.origin,
    conversation_id: conversation,
    agent_steps: agentView.agent.steps,
    agent_metrics: agentView.metrics,
    final_metrics: audit.metrics,
    original_version: file.source_event_id,
    edited_version: edited.source_event_id,
    events: audit.events.length,
    snapshots: audit.snapshots.length,
    browser_errors: errors,
    checks: [
      "agent composer",
      "progress with garden closed",
      "calculate/write/read/final",
      "completed step retry",
      "context exact patch",
      "reload",
      "file download",
      "canonical JSON download",
    ],
  };
  await writeFile(
    new URL("result.json", directory),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ phase: "verified", ...result }));
} finally {
  await browser.close();
}
