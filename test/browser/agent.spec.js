import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Store } from "../../lib/conclave/store.js";
import { ConclaveService } from "../../lib/conclave/service.js";
import { createConclaveHandler } from "../../lib/conclave-local.js";

async function fixture(respond, { jev = false, claude = false } = {}) {
  const store = new Store(undefined, { memory: true });
  const service = new ConclaveService(store, {
    availability: () => ({ openai: true, anthropic: claude, jev }),
    providerFactory: (provider = "openai") => ({ name: provider, respond }),
  });
  const handler = await createConclaveHandler({ service });
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/conclave") return handler(req, res);
    if (path === "/api/models" || path === "/api/session") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify(
          path === "/api/models"
            ? {
                GPT: { models: ["fixture"] },
                Claude: { models: claude ? ["claude-fixture"] : [] },
                Gemini: { models: [] },
              }
            : { authenticated: true },
        ),
      );
    }
    try {
      const file = path === "/" ? "index.html" : path.slice(1);
      const bytes = await readFile(
        new URL("../../public/" + file, import.meta.url),
      );
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    service,
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      store.close();
    },
  };
}
const call = (name, args, id) => ({
  type: "function_call",
  call_id: "call_" + id,
  name,
  arguments: JSON.stringify(args),
});
const response = (output) => ({
  status: "completed",
  model: "fixture",
  usage: { input_tokens: 100, output_tokens: 10 },
  output,
});
const final = response([
  {
    type: "message",
    content: [{ type: "output_text", text: "**Verified**: 42." }],
  },
]);

test("Workspace panel edits documents, source copies, context and state without inference", async ({
  page,
}, testInfo) => {
  let calls = 0;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const app = await fixture(async () => {
    calls++;
    return final;
  });
  const id = app.service.create("Editor proof").conversation_id;
  const h = app.service.harness(id);
  h.addMessage("user", "Keep the workshop small.");
  const original = h.ingestText(
    "source.md",
    "# Source\nUploaded original.\n<script>window.editorInjected=true</script>",
    "",
    { attachment_id: "upload_editor", mime_type: "text/markdown" },
  );
  h.toolResult(
    "workspace_write",
    {
      path: "agent.md",
      content: "# Agent file\nInitial content.",
      expected_source_event_id: null,
    },
    [],
  );
  h.remember("budget", "constraint", "Budget: 100 dollars.");
  try {
    await page.goto(app.url);
    if (page.viewportSize().width < 900) await page.locator("#menu").click();
    await page
      .locator("#server-chats .chat-item")
      .filter({ hasText: "Editor proof" })
      .click();
    await page.locator("#workspace-open").click();
    await expect(page.locator("#workspace-editor")).toBeVisible();
    await expect(page.locator("#editor-preview")).toContainText(
      "Initial content.",
    );
    await page.locator("#editor-edit").click();
    await page.locator("#editor-text").fill("x".repeat(100001));
    await page.locator("#editor-save").click();
    await expect(page.locator("#editor-feedback")).toContainText("100 KB");
    await expect(page.locator("#editor-text")).toHaveValue("x".repeat(100001));
    await page
      .locator("#editor-text")
      .fill("# Human revision\nEdited directly.");
    await page.locator("#editor-preview-toggle").click();
    await expect(page.locator("#editor-preview")).toContainText(
      "Edited directly.",
    );
    await page.locator("#editor-save").click();
    await expect(page.locator("#editor-feedback")).toContainText("Saved");
    expect(app.service.workspaceFile(id, "agent.md").content).toBe(
      "# Human revision\nEdited directly.",
    );
    await page
      .locator("#editor-items button")
      .filter({ hasText: "source.md (original)" })
      .click();
    expect(await page.evaluate(() => window.editorInjected)).toBeUndefined();
    await page.locator("#editor-edit").click();
    await page.locator("#editor-path").fill("source-edited.md");
    await page.locator("#editor-text").fill("# Source copy\nMy revision.");
    await page.locator("#editor-save").click();
    await expect(page.locator("#editor-title")).toHaveText("source-edited.md");
    expect(app.service.sourceEvent(id, original.id).content).toContain(
      "Uploaded original.",
    );
    expect(app.service.workspaceFile(id, "source-edited.md").content).toContain(
      "My revision.",
    );
    await page.getByRole("tab", { name: "Context", exact: true }).click();
    await page
      .locator("#editor-items details")
      .first()
      .locator("summary")
      .click();
    await page
      .locator("#editor-items details")
      .first()
      .getByRole("button", { name: "Open section" })
      .click();
    await page.locator("#editor-edit").click();
    await page
      .locator("#editor-text")
      .fill("Workshop must have at most 12 people.");
    await page.locator("#editor-save").click();
    await expect(page.locator("#editor-feedback")).toContainText("Saved");
    expect(
      app.service
        .view(id)
        .context.segments.some(
          (s) => s.content === "Workshop must have at most 12 people.",
        ),
    ).toBe(true);
    await page.getByRole("tab", { name: "State", exact: true }).click();
    await page.locator("#editor-new-state").click();
    await page.locator("#editor-state-key").fill("venue");
    await page.locator("#editor-state-type").selectOption("question");
    await page.locator("#editor-state-status").selectOption("unresolved");
    await page.locator("#editor-text").fill("Which venue should we use?");
    await page.locator("#editor-save").click();
    await expect(page.locator("#editor-title")).toHaveText("venue");
    expect(
      app.service.view(id).state.entries.find((s) => s.state_key === "venue")
        .status,
    ).toBe("unresolved");
    expect(calls).toBe(0);
    const bounds = await page.locator("#workspace-editor").boundingBox();
    const width = page.viewportSize().width;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath("workspace-state.png") });
    await page.locator("#editor-close").click();
    await expect(page.locator("#workspace-editor")).toBeHidden();
    await page.locator("#context-watch").click();
    await page.locator('#garden-nodes [role="button"]').first().click();
    await expect(page.locator("#workspace-editor")).toBeVisible();
    await expect(page.locator("#editor-document")).toBeVisible();
    await expect(page.locator("#context-garden")).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("Workspace drafts survive close/reload and concurrent versions cannot overwrite them", async ({
  page,
}, testInfo) => {
  const app = await fixture(async () => final);
  const id = app.service.create("Draft proof").conversation_id;
  await app.service.saveDocument(id, {
    path: "draft.md",
    content: "# Original\nFirst version.",
    expected_source_event_id: null,
  });
  try {
    await page.goto(app.url);
    if (page.viewportSize().width < 900) await page.locator("#menu").click();
    await page
      .locator("#server-chats .chat-item")
      .filter({ hasText: "Draft proof" })
      .click();
    await page.locator("#workspace-open").click();
    await page.locator("#editor-edit").click();
    await page.locator("#editor-text").fill("# Draft\nMy unsaved changes.");
    await page.locator("#editor-close").click();
    const version = app.service.workspaceFile(id, "draft.md").source_event_id;
    await app.service.saveDocument(id, {
      path: "draft.md",
      content: "# Updated elsewhere\nNewest saved text.",
      expected_source_event_id: version,
    });
    await page.reload();
    await page.locator("#workspace-open").click();
    await page.locator("#editor-refresh").click();
    await expect(page.locator("#editor-text")).toHaveValue(
      "# Draft\nMy unsaved changes.",
    );
    await expect(page.locator("#editor-feedback")).toContainText(
      "saved version changed",
    );
    await expect(page.locator("#editor-save")).toBeDisabled();
    const download = page.waitForEvent("download");
    await page.locator("#editor-download").click();
    expect(await readFile(await (await download).path(), "utf8")).toBe(
      "# Draft\nMy unsaved changes.",
    );
    await page.screenshot({
      path: testInfo.outputPath("workspace-conflict.png"),
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#editor-latest").click();
    await expect(page.locator("#editor-preview")).toContainText(
      "Newest saved text.",
    );
    expect(app.service.workspaceFile(id, "draft.md").content).toBe(
      "# Updated elsewhere\nNewest saved text.",
    );
  } finally {
    await app.close();
  }
});

test("Claude chips and mentions route saved chat and agent runs, survive reload and export both providers", async ({
  page,
}, testInfo) => {
  const payloads = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const app = await fixture(
    async (payload) => {
      payloads.push(payload);
      return { ...final, model: payload.model };
    },
    { claude: true },
  );
  try {
    await page.goto(app.url);
    await expect(page.locator("#mode-switch")).toBeVisible();
    await page
      .getByLabel("Message", { exact: true })
      .fill("@Claude Use saved context.");
    await page.locator("#send").click();
    await expect(
      page.locator('article.msg[data-provider="claude"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('#recipients [data-name="Claude"]'),
    ).toHaveAttribute("aria-pressed", "true");
    expect(payloads[0].model).toBe("claude-fixture");
    const id = app.service.list()[0].conversation_id;
    expect(app.service.view(id).settings.provider).toBe("anthropic");
    await page.reload();
    await expect(page.locator("#context-provider")).toHaveValue("anthropic");
    await expect(page.locator("#context-reasoning")).toBeDisabled();
    await page.getByRole("radio", { name: "Agent" }).check();
    await page
      .getByLabel("Message", { exact: true })
      .fill("Finish this objective as Claude.");
    await page.locator("#send").click();
    await expect(page.locator("#agent-status")).toContainText("completed");
    expect(app.service.view(id).agent.settings.provider).toBe("anthropic");
    await expect(
      page.locator('article.msg[data-provider="claude"]'),
    ).toHaveCount(2);
    await page.getByRole("radio", { name: "Context" }).check();
    await page.locator('#recipients [data-name="GPT"]').click();
    await expect(page.locator("#context-provider")).toHaveValue("openai");
    await expect(page.locator("#context-reasoning")).toBeEnabled();
    await page.getByLabel("Message", { exact: true }).fill("Continue as GPT.");
    await page.locator("#send").click();
    await expect(page.locator('article.msg[data-provider="gpt"]')).toHaveCount(
      1,
    );
    expect(payloads.at(-1).model).toBe("fixture");
    const download = await page.request.get(
      app.url + "/api/conclave?action=download&conversation=" + id,
    );
    expect(download.ok()).toBe(true);
    const record = await download.json();
    expect(record.participants.map((p) => p.participant_id)).toEqual([
      "human",
      "claude",
      "gpt",
    ]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("claude-conclave.png") });
    await page
      .getByLabel("Message", { exact: true })
      .fill("@GPT @Claude Parallel replies");
    await page.locator("#send").click();
    await expect(page.locator("#status")).toContainText("Choose one assistant");
    expect(payloads).toHaveLength(3);
  } finally {
    await app.close();
  }
});
async function openAgent(page, url) {
  await page.goto(url);
  await expect(page.locator("#mode-switch")).toBeVisible();
  await page.getByRole("radio", { name: "Agent" }).check();
  await expect(page.locator("#agent-mode")).toBeChecked();
  await expect(page.locator("#send")).toHaveText("Run agent");
}

test("browser drives real HTTP/service/storage, renders artifacts and resumes after reload", async ({
  page,
}, testInfo) => {
  let calls = 0;
  const app = await fixture(async () => {
    calls++;
    return calls === 1
      ? response([
          call("calculate", { operation: "multiply", values: [6, 7] }, 1),
        ])
      : calls === 2
        ? response([
            call(
              "workspace_write",
              {
                path: "result.md",
                content: "# Result\n42\n<script>window.injected=true</script>",
              },
              2,
            ),
          ])
        : calls === 3
          ? response([
              call("workspace_read", { path: "result.md", offset: 0 }, 3),
            ])
          : final;
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await openAgent(page, app.url);
    await page
      .getByLabel("Message", { exact: true })
      .fill("Calculate, save and verify.");
    await page.locator("#send").click();
    await expect(page.locator("#agent-status")).toContainText("completed");
    await expect(page.locator("#agent-status")).toContainText("4/40 steps");
    await expect(page.locator("#agent-files")).toContainText("result.md");
    await expect(page.locator(".markdown strong")).toHaveText("Verified");
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
    expect(calls).toBe(4);
    await page.locator("#workspace-panel > summary").click();
    const fileDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download result.md" }).click();
    expect(await readFile(await (await fileDownload).path(), "utf8")).toContain(
      "# Result\n42",
    );
    await page.locator("#context-panel > summary").click();
    await page.screenshot({
      path: testInfo.outputPath("agent-completed.png"),
      fullPage: true,
    });
    const download = page.waitForEvent("download");
    await page.locator("#more-menu > summary").click();
    await page.locator("#export-json").click();
    const record = JSON.parse(
      await readFile(await (await download).path(), "utf8"),
    );
    expect(
      record.context_layer.events.some((e) => e.kind === "agent_checkpoint"),
    ).toBe(true);
    expect(
      record.context_layer.events.some(
        (e) => e.kind === "document" && e.content.includes("42"),
      ),
    ).toBe(true);
    const id = app.service.list()[0].conversation_id;
    await app.service.agentStart(id, {
      message_id: "msg_resume",
      content: "Finish this resumed objective.",
      settings: { model: "fixture" },
    });
    await page.reload();
    await expect(page.locator("#agent-resume")).toBeVisible();
    expect(calls).toBe(4);
    await page.locator("#agent-resume").click();
    await expect(page.locator("#agent-status")).toContainText("completed");
    expect(calls).toBe(5);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
});

test("Stop waits for the current call and prevents further steps", async ({
  page,
}) => {
  let release,
    calls = 0;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const app = await fixture(async () => {
    calls++;
    await waiting;
    return response([
      call("calculate", { operation: "add", values: [1, 2] }, 1),
    ]);
  });
  try {
    await openAgent(page, app.url);
    await page.getByLabel("Message", { exact: true }).fill("Keep calculating.");
    await page.locator("#send").click();
    await expect(page.locator("#agent-stop")).toBeEnabled();
    await expect(page.locator("#run-progress")).toContainText("Model working");
    await expect(page.locator("#context-garden")).toBeHidden();
    await page.locator("#agent-stop").click();
    await expect(page.locator("#status")).toContainText("Stopping");
    release();
    await expect(page.locator("#agent-status")).toContainText("stopped");
    expect(calls).toBe(1);
    await expect(page.locator("#send")).toBeEnabled();
  } finally {
    release();
    await app.close();
  }
});

test("Agent Mode and normal Send share files, Jev defaults and budgets", async ({
  page,
}) => {
  let calls = 0;
  const app = await fixture(
    async (payload) => {
      calls++;
      const manifest = JSON.parse(payload.input[1].content.split("\n")[1]);
      if (calls === 1)
        return response([
          call(
            "workspace_write",
            {
              path: "plan.md",
              content: "# Plan\nBudget: 100\n## Safeguarding\nKeep two adults.",
              expected_source_event_id: null,
            },
            1,
          ),
        ]);
      if (calls === 2 || calls === 4 || calls === 6)
        return response([
          call("workspace_read", { path: "plan.md", offset: 0 }, calls),
        ]);
      if (calls === 5)
        return response([
          call(
            "workspace_patch",
            {
              path: "plan.md",
              find: "Budget: 100",
              replace: "Budget: 150",
              expected_source_event_id: manifest[0].source_event_id,
            },
            5,
          ),
        ]);
      return final;
    },
    { jev: true },
  );
  try {
    await openAgent(page, app.url);
    await expect(page.locator("#context-jev")).toBeChecked();
    await page.getByLabel("Message", { exact: true }).fill("Save the plan.");
    await page.locator("#send").click();
    await expect(page.locator("#agent-status")).toContainText("completed");
    await expect(page.locator("#send")).toBeEnabled();
    await page.getByRole("radio", { name: "Context" }).check();
    await expect(page.locator("#agent-mode")).not.toBeChecked();
    await expect(page.locator("#send")).toHaveText("Send");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Change budget to 150 and preserve safeguarding.");
    await page.locator("#send").click();
    await expect(page.locator("#status")).toContainText("Ready");
    expect(calls).toBe(7);
    const id = app.service.list()[0].conversation_id,
      view = app.service.view(id);
    expect(view.settings.jev).toBe(true);
    expect(view.settings.budget).toBe(256000);
    expect(view.settings.output).toBe(16384);
    expect(view.workspace[0].content).toBe(
      "# Plan\nBudget: 150\n## Safeguarding\nKeep two adults.",
    );
    await page.reload();
    await expect(page.locator("#agent-mode")).not.toBeChecked();
    await expect(page.locator("#workspace-panel")).toBeVisible();
  } finally {
    await app.close();
  }
});
