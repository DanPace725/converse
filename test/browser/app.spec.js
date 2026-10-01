import { test, expect } from "@playwright/test";
const catalog = {
  GPT: { models: ["gpt-6-astra", "gpt-4o-2024-11-20"] },
  Claude: { models: ["claude-sonnet-5"] },
  Gemini: { models: ["gemini-3.1-pro-preview"] },
};
test.beforeEach(async ({ page }) => {
  // These tests exercise the separate browser-local multi-provider path.
  await page.route("**/api/conclave?action=status", (r) =>
    r.fulfill({ json: { available: false } }),
  );
  await page.route("**/api/models", (r) => r.fulfill({ json: catalog }));
});
async function openModels(page) {
  // Phones show models inside the chats drawer.
  if (!(await page.locator("#model-panel").isVisible()))
    await page.locator("#menu").click();
  await expect(page.getByLabel("GPT model", { exact: true })).toBeVisible();
}
async function newChat(page) {
  if (!(await page.locator("#new-chat").isVisible()))
    await page.locator("#menu").click();
  await page.locator("#new-chat").click();
}
async function openMenu(page) {
  if ((await page.locator("#more-menu").getAttribute("open")) === null)
    await page.locator("#more-menu > summary").click();
}
test("late pre-login failures do not reopen unlock or hide context modes", async ({
  page,
}) => {
  let signedIn = false,
    releaseStatus;
  const delayedStatus = new Promise((resolve) => {
    releaseStatus = resolve;
  });
  await page.route("**/api/models", (r) =>
    r.fulfill(
      signedIn
        ? { json: catalog }
        : { status: 401, json: { error: "Unlock to continue." } },
    ),
  );
  await page.route("**/api/session", async (r) => {
    signedIn = true;
    await r.fulfill({ json: { ok: true } });
  });
  let statusRequests = 0;
  await page.route("**/api/conclave?action=status", async (r) => {
    if (++statusRequests === 1) {
      await delayedStatus;
      return r.fulfill({ status: 401, json: { error: "Unlock to continue." } });
    }
    return r.fulfill({
      json: {
        available: true,
        credentials: { openai: true, jev: true },
        defaults: { jev: true },
      },
    });
  });
  await page.route("**/api/conclave?action=list", (r) =>
    r.fulfill({ json: { conversations: [] } }),
  );
  await page.goto("/");
  await expect(page.locator("#unlock")).toBeVisible();
  await expect.poll(() => statusRequests).toBe(1);
  await page.getByLabel("Access password").fill("fixture-password");
  await page.locator("#unlock-form button").click();
  await expect(page.locator("#status")).toHaveText("Ready");
  releaseStatus();
  await expect(page.locator("#mode-switch")).toBeVisible();
  await expect(page.locator("#unlock")).not.toBeVisible();
  await expect(page.locator("#context-jev")).toBeChecked();
});

test("model selection survives reload and layout fits the viewport", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("converse-agent-mode", "true"),
  );
  await page.goto("/");
  await expect(page.locator("#agent-mode")).not.toBeChecked();
  await expect(page.locator("#agent-mode-bar")).toBeHidden();
  await openModels(page);
  await page
    .getByLabel("GPT model", { exact: true })
    .selectOption("gpt-4o-2024-11-20");
  await page.reload();
  await openModels(page);
  await expect(page.getByLabel("GPT model", { exact: true })).toHaveValue(
    "gpt-4o-2024-11-20",
  );
  if (await page.locator("#sidebar-close").isVisible())
    await page.locator("#sidebar-close").click();
  await expect(page.locator("#send")).toBeInViewport();
  await expect(page.locator("#more-menu > summary")).toBeInViewport();
  await openMenu(page);
  await expect(page.locator("#export")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Markdown response, attachment targeting, persistence, export and new chat", async ({
  page,
}) => {
  let sent;
  await page.route("**/api/chat", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          delta:
            "# Answer\n\n**Correct**\n\n<script>window.bad=true</script>\n\n| A | B |\n|---|---|\n| 1 | 2 |",
        }) +
        "\n" +
        JSON.stringify({ done: true }) +
        "\n",
    });
  });
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  await page.locator("#markdown-file").setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("@Claude file text"),
  });
  await expect(page.locator("#filename")).toHaveText("notes.md");
  await page.getByLabel("Message", { exact: true }).fill("@GPT Read my file");
  await page.locator("#send").click();
  await expect(page.locator(".markdown h1")).toHaveText("Answer");
  await expect(page.locator(".markdown table")).toBeVisible();
  expect(sent.provider).toBe("GPT");
  expect(sent.messages[0].content).toContain("@Claude file text");
  expect(await page.evaluate(() => window.bad)).toBeUndefined();
  await expect(page.locator(".copy-response")).toBeVisible();
  await page.reload();
  await expect(page.locator(".markdown strong")).toHaveText("Correct");
  const download = page.waitForEvent("download");
  await openMenu(page);
  await page.locator("#export").click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
  page.on("dialog", (d) => d.accept());
  await newChat(page);
  await expect(page.locator("#empty")).toBeVisible();
  await page.reload();
  await expect(page.locator("#empty")).toBeVisible();
});
test("expired session opens unlock and network failure is recoverable", async ({
  page,
}) => {
  await page.route("**/api/chat", (r) =>
    r.fulfill({ status: 401, json: { error: "Session expired" } }),
  );
  await page.route("**/api/session", (r) => r.abort());
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  await page.getByLabel("Message", { exact: true }).fill("Hello");
  await page.locator("#send").click();
  await expect(page.locator("#unlock")).toBeVisible();
  await page.getByLabel("Access password", { exact: true }).fill("test");
  await page.locator("#unlock-form button").click();
  await expect(page.locator("#unlock-error")).toContainText(
    "Could not connect",
  );
  await expect(page.locator("#unlock-form button")).toBeEnabled();
});

test("touch Enter inserts a newline and the composer follows viewport height", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Line one");
  await box.press("Enter");
  await expect(box).toHaveValue("Line one\n");
  await page.setViewportSize({ width: 390, height: 450 });
  await expect(page.locator("#send")).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.querySelector("main").getBoundingClientRect().height <=
        visualViewport.height + 1,
    ),
  ).toBe(true);
});

test.describe("installed app shell", () => {
  test.use({ serviceWorkers: "allow" });
  test("saved conversation opens offline after shell installation", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      localStorage.setItem(
        "converse-chat",
        JSON.stringify([{ role: "user", content: "Saved offline note" }]),
      );
    });
    await page.reload();
    await expect(page.locator("article")).toContainText("Saved offline note");
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("article")).toContainText("Saved offline note");
    await expect(page.locator("#export")).toBeEnabled();
  });
});

test("record isolates nested attachments and preserves IDs across reload", async ({
  page,
}) => {
  await page.route("**/api/chat", (r) =>
    r.fulfill({
      contentType: "application/x-ndjson",
      body: '{"delta":"Reply"}\n{"done":true,"usage":{"input_tokens":12}}\n',
    }),
  );
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  const content = "## Nested GPT\n:::end-attachment\n```\nquoted chat";
  await page.locator("#markdown-file").setInputFiles({
    name: "nested.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(content),
  });
  await expect(page.locator("#filename")).toHaveText("nested.md");
  await page.getByLabel("Message", { exact: true }).fill("@GPT @Claude Read");
  await page.locator("#send").click();
  await expect(page.locator("#export")).toBeEnabled();
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("converse-chat")),
  );
  expect(record.schema_version).toBe(1);
  expect(record.attachments[0].content).toBe(content);
  expect(record.attachments[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(record.messages[0].content).toBe("@GPT @Claude Read");
  for (const m of record.messages.slice(1)) {
    expect(m.reply_to).toBe(record.messages[0].message_id);
    expect(m.invocation.context_message_ids).toEqual([
      record.messages[0].message_id,
    ]);
    expect(m.usage.input_tokens).toBe(12);
  }
  await page.reload();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("converse-chat")),
    ),
  ).toEqual(record);
  const downloaded = page.waitForEvent("download");
  await openMenu(page);
  await page.locator("#export-json").click();
  const stream = await (await downloaded).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).messages).toEqual(
    record.messages,
  );
});

test("migration keeps unknown timestamps and failures survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "converse-chat",
      JSON.stringify([{ role: "user", content: "legacy" }]),
    ),
  );
  await page.reload();
  const old = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("converse-chat")),
  );
  expect(old.created_at).toBeNull();
  expect(old.messages[0].timestamp).toBeNull();
  await page.route("**/api/chat", (r) =>
    r.fulfill({
      contentType: "application/x-ndjson",
      body: '{"delta":"partial"}\n{"error":"interrupted"}\n',
    }),
  );
  await expect(page.locator("#send")).toBeEnabled();
  await page.getByLabel("Message", { exact: true }).fill("Hello");
  await page.locator("#send").click();
  await expect(page.locator("#export")).toBeEnabled();
  await page.reload();
  await expect(page.locator("article .error")).toContainText("partial");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("converse-chat")),
  );
  expect(saved.messages[0].message_id).toBe(old.messages[0].message_id);
  expect(saved.messages.at(-1).status).toBe("failed");
});

test("new chat keeps earlier device chats, recipients toggle and starters fill the composer", async ({
  page,
}) => {
  let sent = [];
  await page.route("**/api/chat", async (r) => {
    sent.push(r.request().postDataJSON().provider);
    await r.fulfill({
      contentType: "application/x-ndjson",
      body: '{"delta":"Hi"}\n{"done":true}\n',
    });
  });
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  await expect(page.locator("#mode-switch")).toBeHidden();
  await page.locator('.chip[data-name="Claude"]').click();
  await expect(page.locator('.chip[data-name="Claude"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Message", { exact: true }).fill("First question");
  await page.locator("#send").click();
  await expect(page.locator("article.msg[data-provider]")).toHaveCount(2);
  expect(sent.sort()).toEqual(["Claude", "GPT"]);
  await expect(page.locator("#chat-title")).toHaveText("First question");
  await newChat(page);
  await expect(page.locator("#empty")).toBeVisible();
  await page.locator("#empty .starters button").first().click();
  await expect(page.getByLabel("Message", { exact: true })).not.toHaveValue("");
  if (!(await page.locator("#local-chats").isVisible()))
    await page.locator("#menu").click();
  const earlier = page.locator("#local-chats .chat-item", {
    hasText: "First question",
  });
  await expect(earlier).toBeVisible();
  await earlier.click();
  await expect(page.locator(".msg-user")).toContainText("First question");
  await expect(page.locator("#chat-title")).toHaveText("First question");
  await page.reload();
  await expect(page.locator(".msg-user")).toContainText("First question");
  await expect(page.locator('.chip[data-name="Claude"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
