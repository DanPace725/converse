import { test, expect } from "@playwright/test";
import { mkdirSync } from 'node:fs';
const catalog = {
  GPT: { models: ["gpt-6-astra", "gpt-4o-2024-11-20"] },
  Claude: { models: ["claude-sonnet-5"] },
  Gemini: { models: ["gemini-3.1-pro-preview"] },
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/title', route => route.fulfill({ status: 503, json: { error: 'Naming unavailable in this fixture' } }));
  // These tests exercise the separate browser-local multi-provider path.
  await page.route("**/api/conclave?action=status", (r) =>
    r.fulfill({ json: { available: false } }),
  );
  await page.route("**/api/models", (r) => r.fulfill({ json: catalog }));
});

test('reasoning survives ordinary chat reload and exports while response Copy stays answer-only', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedText = text; } } }));
  await page.route('**/api/chat', route => route.fulfill({ contentType: 'application/x-ndjson', body: [
    { type: 'reasoning', block: '0', delta: 'Check the arithmetic.' },
    { delta: '**Answer**: 3.' },
    { done: true, reasoning: { provider: 'GPT', text: 'Check the arithmetic.', status: 'completed', opaque_available: true }, provenance: { native_output: [{ type: 'reasoning', encrypted_content: 'opaque-secret' }] } },
  ].map(e => JSON.stringify(e) + '\n').join('') }));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('What is one plus two?');
  await page.locator('#send').click();
  await expect(page.locator('#send')).toBeEnabled();
  // Reasoning is one quiet line inside the reply until tapped.
  const summary = page.locator('article[data-provider] .thoughts');
  await expect(summary).toHaveCount(1);
  await expect(summary.locator('.thoughts-snippet')).toHaveText('Check the arithmetic.');
  await expect(summary.locator('.thoughts-steps')).toBeHidden();
  await summary.locator('.thoughts-toggle').click();
  await expect(summary.locator('.thought-text')).toContainText('Check the arithmetic.');
  await page.locator('.copy-response').click();
  expect(await page.evaluate(() => window.copiedText)).toBe('**Answer**: 3.');
  await page.reload();
  await expect(summary).toHaveCount(1);
  await expect(page.locator('#chat')).not.toContainText('opaque-secret');
  for (const [button, expected] of [['#export-json', 'opaque-secret'], ['#export', 'Reasoning summary']]) {
    if (!(await page.locator('#more-menu').evaluate(el => el.open))) await page.locator('#more-menu > summary').click();
    const download = page.waitForEvent('download');
    await page.locator(button).click();
    const exported = await download;
    expect(exported.suggestedFilename()).toMatch(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.(json|md)$/);
    const stream = await exported.createReadStream();
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toContain(expected);
  }
});

test('automatic names persist and user Copy/Edit resends a linked revision with its attachment', async ({ page }, testInfo) => {
  let titles = 0;
  const calls = [];
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async text => { window.copiedText = text; } },
  }));
  await page.route('**/api/title', async route => {
    titles++;
    expect(route.request().postDataJSON().provider).toBe('GPT');
    await route.fulfill({ json: { title: 'Project Memory Design' } });
  });
  await page.route('**/api/chat', async route => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ delta: 'A useful answer.' }) + '\n' + JSON.stringify({ done: true }) + '\n' });
  });
  await page.goto('/');
  await page.locator('#markdown-file').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\nKeep the original.') });
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Help me design project memory.');
  await page.locator('#send').click();
  await expect(page.locator('#chat-title')).toHaveText('Project Memory Design');
  for (const [button, extension] of [['#export-json', 'json'], ['#export', 'md']]) {
    if (!(await page.locator(button).isVisible())) await page.locator('#more-menu > summary').click();
    const download = page.waitForEvent('download');
    await page.locator(button).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`^Project Memory Design_\\d{4}-\\d{2}-\\d{2}T.*Z\\.${extension}$`));
  }
  await page.locator('.msg-user').first().getByRole('button', { name: 'Copy your message' }).click();
  expect(await page.evaluate(() => window.copiedText)).toBe('Help me design project memory.');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Unsent draft.');
  await page.locator('.msg-user').first().getByRole('button', { name: 'Edit your message' }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Help me design project memory.');
  await expect(page.locator('#filename')).toHaveText('notes.md');
  await page.locator('#cancel-message-edit').click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Unsent draft.');
  await expect(page.locator('#attachment')).toBeHidden();
  await page.locator('.msg-user').first().getByRole('button', { name: 'Edit your message' }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Use three memory layers instead.');
  await expect(page.locator('#send')).toBeInViewport({ ratio: 1 });
  mkdirSync('.agent-smoke', { recursive: true });
  await page.screenshot({ path: `.agent-smoke/message-edit-${testInfo.project.name}.png` });
  await page.locator('#send').click();
  await expect(page.locator('.msg-user')).toHaveCount(2);
  await expect(page.locator('#message-edit')).toBeHidden();
  await expect(page.locator('#send')).toBeEnabled();
  expect(calls[1].messages.at(-1).content).toContain('Application metadata: revision of message');
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('converse-chat')));
  expect(record.messages[2].revises_message_id).toBe(record.messages[0].message_id);
  expect(record.attachments).toHaveLength(2);
  expect(record.attachments[0].content).toBe(record.attachments[1].content);
  expect(record.attachments[0].attachment_id).not.toBe(record.attachments[1].attachment_id);
  await page.reload();
  await expect(page.locator('#chat-title')).toHaveText('Project Memory Design');
  expect(titles).toBe(1);
  await newChat(page);
  await expect(page.locator('#chat-title')).toHaveText('New chat');
});

test('model math renders safely before Markdown consumes delimiters and preserves raw Copy/export', async ({ page }, testInfo) => {
  const math = String.raw`Inline \(\frac{a_1}{b_2}\) and $x_i^2$.

\[\begin{aligned}a&=b+c\\d&=e\end{aligned}\]

$$\int_0^1 x^2\,dx = \frac{1}{3}$$

Currency costs $5 and $10. Code stays literal: \`$z$\`.

\`\`\`latex
\[x_y\]
\`\`\`

Invalid math \(\frac{1}\) stays readable. Untrusted math \(\href{javascript:alert(1)}{click}\).
<img src=x onerror="window.mathInjected=true">`;
  // Remove template-literal escapes from the Markdown backticks only.
  const responseText = math.replace(/\\`/g, '`');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async text => { window.copiedText = text; } },
  }));
  await page.route('**/api/chat', route => route.fulfill({ contentType: 'application/x-ndjson', body:
    JSON.stringify({ delta: responseText.slice(0, 20) }) + '\n' + JSON.stringify({ delta: responseText.slice(20) }) + '\n' + JSON.stringify({ done: true }) + '\n' }));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Show some equations.');
  await page.locator('#send').click();
  await expect(page.locator('#send')).toBeEnabled();
  const answer = page.locator('article[data-provider="gpt"]');
  await expect(answer.locator('.katex')).toHaveCount(5);
  await expect(answer.locator('.katex-display')).toHaveCount(2);
  await expect(answer.locator('math')).toHaveCount(5);
  await expect(answer.locator('pre code')).toHaveText(String.raw`\[x_y\]`);
  await expect(answer.locator('code .katex')).toHaveCount(0);
  await expect(answer).toContainText('Currency costs $5 and $10.');
  await expect(answer.locator('.katex-error')).toHaveCount(1);
  await expect(answer.locator('img, a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.mathInjected)).toBeUndefined();
  await answer.getByRole('button', { name: 'Copy GPT response' }).click();
  expect(await page.evaluate(() => window.copiedText)).toBe(responseText);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('converse-chat')).messages.at(-1).content)).toBe(responseText);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync('.agent-smoke', { recursive: true });
  await page.screenshot({ path: `.agent-smoke/math-${testInfo.project.name}.png` });
  await page.reload();
  await expect(page.locator('article[data-provider="gpt"] .katex')).toHaveCount(5);
  expect(errors).toEqual([]);
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
    // Only submitting the password unlocks; the splash also asks which sign-in applies.
    if (r.request().method() === "POST") signedIn = true;
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
}, testInfo) => {
  await page.route("**/api/chat", (r) =>
    r.fulfill({ status: 401, json: { error: "Session expired" } }),
  );
  await page.route("**/api/session", (r) => r.abort());
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  await page.getByLabel("Message", { exact: true }).fill("Hello");
  await page.locator("#send").click();
  await expect(page.locator("#unlock")).toBeVisible();
  await expect(page.getByLabel("Access password", { exact: true })).toBeFocused();
  await page.screenshot({ path: `.agent-smoke/splash-password-${testInfo.project.name}.png` });
  await page.getByLabel("Access password", { exact: true }).fill("test");
  await page.locator("#unlock-form button").click();
  await expect(page.locator("#unlock-error")).toContainText(
    "Could not connect",
  );
  await expect(page.locator("#unlock-form button")).toBeEnabled();
});

test("Google sign-in replaces the password form, reports a refused account and signs out", async ({
  page,
}) => {
  let signedIn = false;
  await page.route("**/api/models", (r) =>
    r.fulfill(
      signedIn
        ? { json: catalog }
        : { status: 401, json: { error: "Sign in to continue." } },
    ),
  );
  await page.route("**/api/session", (r) => {
    const method = r.request().method();
    // The app follows the returned address; the refused return stands in for Google.
    if (method === "POST") return r.fulfill({ json: { url: "/?signin=denied" } });
    if (method === "DELETE") signedIn = false;
    return r.fulfill({
      json: {
        sign_in: "google",
        user: signedIn ? { email: "ada@example.com" } : null,
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#google-sign-in")).toBeVisible();
  await expect(page.locator("#unlock-form")).toBeHidden();
  await page.locator("#google-sign-in").click();
  await expect(page.locator("#unlock-error")).toContainText(
    "does not have access",
  );
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#google-sign-in")).toBeEnabled();
  signedIn = true;
  await page.reload();
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(page.locator("#unlock")).not.toBeVisible();
  await openMenu(page);
  await expect(page.locator("#sign-out")).toHaveText(
    "Sign out (ada@example.com)",
  );
  await page.locator("#sign-out").click();
  await expect(page.locator("#google-sign-in")).toBeVisible();
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

// Synthetic single-finger drag on the conversation; `release` lifts the finger.
async function drag(page, distance, { release = true } = {}) {
  await page.evaluate(
    ([distance, release]) => {
      const chat = document.querySelector("#chat");
      const { left, top, width } = chat.getBoundingClientRect();
      const fire = (type, y) => {
        const touch = new Touch({
          identifier: 1,
          target: chat,
          clientX: left + width / 2,
          clientY: top + 20 + y,
        });
        chat.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : [touch],
            changedTouches: [touch],
          }),
        );
      };
      fire("touchstart", 0);
      for (let step = 1; step <= 8; step++)
        fire("touchmove", (distance * step) / 8);
      if (release) fire("touchend", distance);
    },
    [distance, release],
  );
}
test("pulling down at the top refreshes in place and Reload app reloads the page", async ({
  page,
}, testInfo) => {
  let modelRequests = 0;
  await page.route("**/api/models", (r) => {
    modelRequests++;
    return r.fulfill({ json: catalog });
  });
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Ready");
  await page.evaluate(() => (window.loadedOnce = true));
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Unsent draft");
  const chip = page.locator("#pull-refresh");
  const loaded = modelRequests;
  if (testInfo.project.name === "mobile") {
    // A short pull, and a pull that starts below the top, do nothing.
    await drag(page, 80);
    await expect(chip).toHaveAttribute("data-state", "");
    await page.evaluate(() => {
      const filler = document.createElement("div");
      filler.id = "filler";
      filler.style.height = "3000px";
      document.querySelector("#chat").prepend(filler);
      document.querySelector("#chat").scrollTop = 400;
    });
    await drag(page, 300);
    await expect(chip).toHaveAttribute("data-state", "");
    await page.evaluate(() => document.querySelector("#filler").remove());
    expect(modelRequests).toBe(loaded);

    await drag(page, 300, { release: false });
    await expect(chip).toHaveAttribute("data-state", "ready");
    await expect(chip).toHaveCSS("opacity", "1");
    await page.evaluate(() =>
      document
        .querySelector("#chat")
        .dispatchEvent(new TouchEvent("touchend", { bubbles: true })),
    );
    await expect(chip).toHaveAttribute("data-state", "refreshing");
    await expect(chip).toHaveAttribute("data-state", "");
    await expect(chip).toHaveCSS("opacity", "0");
    await expect(page.locator("#status")).toHaveText("Ready");
    expect(modelRequests).toBe(loaded + 1);
    await expect(box).toHaveValue("Unsent draft");
    expect(await page.evaluate(() => window.loadedOnce)).toBe(true);
  }
  await openMenu(page);
  await Promise.all([
    page.waitForEvent("load"),
    page.locator("#reload-app").click(),
  ]);
  await expect(page.locator("#status")).toHaveText("Ready");
  expect(await page.evaluate(() => window.loadedOnce)).toBeUndefined();
  expect(modelRequests).toBeGreaterThan(loaded);
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

test("holding a recipient opens its models; choosing one sets the model and addresses the message", async ({
  page,
}) => {
  const sent = [];
  await page.route("**/api/chat", async (r) => {
    const { provider, model } = r.request().postDataJSON();
    sent.push(provider + ":" + model);
    await r.fulfill({
      contentType: "application/x-ndjson",
      body: '{"delta":"Hi"}\n{"done":true}\n',
    });
  });
  await page.goto("/");
  await expect(page.locator("#send")).toBeEnabled();
  const chip = (name) => page.locator(`.chip[data-name="${name}"]`);
  const menu = page.locator("#model-menu");
  await expect(chip("GPT").locator("small")).toHaveText("gpt-6-astra");
  // A hold opens the menu without toggling the recipient.
  await chip("Claude").click({ delay: 650 });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio")).toHaveText(["claude-sonnet-5"]);
  await expect(chip("Claude")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await chip("GPT").click({ delay: 650 });
  await expect(
    menu.getByRole("menuitemradio", { name: "gpt-6-astra" }),
  ).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "GPT-4o" }).click();
  await expect(menu).toBeHidden();
  await expect(chip("GPT").locator("small")).toHaveText("gpt-4o-2024-11-20");
  // Keyboard: arrow into the menu, choose, and focus returns to the chip.
  await chip("Claude").focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitemradio")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(chip("Claude")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("Claude")).toBeFocused();
  // A short click still only toggles.
  await chip("Claude").click();
  await expect(menu).toBeHidden();
  await expect(chip("Claude")).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Message", { exact: true }).fill("Which model?");
  await page.locator("#send").click();
  await expect(page.locator("article.msg[data-provider]")).toHaveCount(1);
  expect(sent).toEqual(["GPT:gpt-4o-2024-11-20"]);
  await page.reload();
  await expect(chip("GPT").locator("small")).toHaveText("gpt-4o-2024-11-20");
});

test('replies keep your place: sending lifts your message and finishing does not jump', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} of a long answer.`).join('\n\n');
  await page.route('**/api/chat', route => route.fulfill({
    contentType: 'application/x-ndjson',
    body: long.match(/[\s\S]{1,40}/g).map(delta => JSON.stringify({ delta }) + '\n').join('') + JSON.stringify({ done: true }) + '\n',
  }));
  await page.goto('/');
  await expect(page.locator('#send')).toBeEnabled();
  const box = page.getByLabel('Message', { exact: true });
  await box.fill('First question');
  await page.locator('#send').click();
  await expect(page.locator('#send')).toBeEnabled();
  await box.fill('Second question');
  await page.locator('#send').click();
  const chat = page.locator('#chat');
  const offset = () => page.locator('.msg-user').last().evaluate(el =>
    el.getBoundingClientRect().top - el.parentElement.getBoundingClientRect().top);
  await expect.poll(offset).toBeLessThan(40);
  const top = await chat.evaluate(el => el.scrollTop);
  await expect(page.locator('#send')).toBeEnabled();
  await expect(chat).toContainText('Paragraph 60 of a long answer.');
  expect(await chat.evaluate(el => el.scrollTop)).toBe(top);
  await expect(page.locator('.is-streaming')).toHaveCount(0);
});

test('personal API keys: first sign-in opens the dialog, a refused key stays out, a saved key shows only its ending', async ({ page }, testInfo) => {
  const providers = [['openai', 'OpenAI'], ['anthropic', 'Anthropic'], ['gemini', 'Google Gemini'], ['jev', 'Jev']]
    .map(([id, label]) => ({ id, label, source: null }));
  const posted = [];
  let catalogLoads = 0;
  await page.route('**/api/models', route => { catalogLoads++; return route.fulfill({ json: catalog }); });
  await page.route('**/api/keys', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, providers } });
    const input = route.request().postDataJSON();
    posted.push(input);
    const row = providers.find(item => item.id === input.provider);
    if (input.action === 'save' && input.key.includes('bad'))
      return route.fulfill({ status: 400, json: { error: `${row.label} did not accept this key.` } });
    Object.assign(row, input.action === 'save' ? { source: 'own', hint: input.key.slice(-4) } : { source: null, hint: undefined });
    return route.fulfill({ json: { enabled: true, providers } });
  });
  await page.goto('/');
  const dialog = page.locator('#keys-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#keys-status')).toHaveText('Add a key for at least one provider to start chatting.');
  await expect(dialog.locator('.key-row strong')).toHaveText(['OpenAI', 'Anthropic', 'Google Gemini', 'Jev']);
  const openai = dialog.locator('.key-row[data-provider="openai"]');
  await expect(openai.locator('.note')).toHaveText('No key saved');
  await expect(openai.locator('.key-remove')).toBeHidden();

  await openai.locator('input').fill('sk-bad-key-0000');
  await openai.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#keys-status')).toHaveText('OpenAI did not accept this key.');
  await expect(openai.locator('.note')).toHaveText('No key saved');

  const loadsBefore = catalogLoads;
  await openai.locator('input').fill('  sk-good-key-1234 ');
  await openai.locator('input').press('Enter');
  await expect(openai.locator('.note')).toHaveText('Your key ending in 1234');
  await expect(page.locator('#keys-status')).toHaveText('OpenAI key saved.');
  await expect(openai.locator('input')).toHaveValue('');
  await expect(dialog).not.toContainText('sk-good');
  // Model lists follow the saved keys.
  await expect.poll(() => catalogLoads).toBeGreaterThan(loadsBefore);
  await page.screenshot({ path: `.agent-smoke/api-keys-${testInfo.project.name}.png` });

  await openai.locator('.key-remove').click();
  await expect(openai.locator('.note')).toHaveText('No key saved');
  expect(posted.map(input => input.action)).toEqual(['save', 'save', 'remove']);
  await page.locator('#keys-close').click();
  await expect(dialog).toBeHidden();

  // With a usable key the dialog waits to be asked for.
  providers[1].source = 'shared';
  await page.reload();
  await expect(page.locator('#send')).toBeEnabled();
  await expect(dialog).toBeHidden();
  await page.locator('#more-menu > summary').click();
  await page.locator('#keys-open').click();
  await expect(dialog.locator('.key-row[data-provider="anthropic"] .note')).toHaveText("Using this app's shared key");
});

test('the API keys menu item stays hidden where personal keys are off', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#send')).toBeEnabled();
  await expect(page.locator('#keys-dialog')).toBeHidden();
  await page.locator('#more-menu > summary').click();
  await expect(page.locator('#docs-open')).toBeVisible();
  await expect(page.locator('#keys-open')).toBeHidden();
});

test('a first visit meets the splash page: explanation, sign-in in the middle, GitHub and Docs', async ({ page }, testInfo) => {
  let signedIn = false;
  await page.route('**/api/models', route => route.fulfill(signedIn ? { json: catalog } : { status: 401, json: { error: 'Sign in to continue.' } }));
  await page.route('**/api/session', route => route.fulfill({ json: { sign_in: 'google', user: signedIn ? { email: 'ada@example.com' } : null, access: signedIn } }));
  await page.goto('/');
  const splash = page.locator('#unlock');
  await expect(splash).toBeVisible();
  await expect(splash.getByRole('heading', { level: 1 })).toHaveText('Converse');
  await expect(splash).toContainText('One conversation, several AI models.');
  await expect(page.locator('#google-sign-in')).toBeVisible();
  await expect(page.locator('#unlock-form')).toBeHidden();
  // It covers the whole app, with the sign-in button in the middle of the page.
  const view = page.viewportSize();
  const box = await splash.boundingBox();
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([view.width, view.height]);
  const button = await page.locator('#google-sign-in').boundingBox();
  expect(Math.abs(button.x + button.width / 2 - view.width / 2)).toBeLessThan(2);
  expect(Math.abs(button.y + button.height / 2 - view.height / 2)).toBeLessThan(view.height * 0.2);
  const github = splash.getByRole('link', { name: 'GitHub' });
  await expect(github).toHaveAttribute('href', 'https://github.com/DanPace725/converse');
  await expect(github).toHaveAttribute('target', '_blank');
  // Nothing starts out ringed; the first Tab reaches the sign-in button.
  await expect(splash.locator('.splash')).toBeFocused();
  await page.screenshot({ path: `.agent-smoke/splash-${testInfo.project.name}.png` });
  await page.keyboard.press('Tab');
  await expect(page.locator('#google-sign-in')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(splash).toBeVisible();

  // Docs is readable before signing in, on top of the splash.
  await splash.getByRole('button', { name: 'Docs' }).click();
  await expect(page.locator('#docs-dialog')).toBeVisible();
  await expect(page.locator('#docs-title')).toHaveText('Docs');
  await expect(page.locator('#docs-content')).toContainText('Removal is not permanent erasure');
  await page.locator('#docs-close').click();
  await expect(splash).toBeVisible();

  // Once in, the splash is gone at once on later visits, and Docs is in the menu.
  signedIn = true;
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(splash).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('converse-entered'))).toBe('1');
  await page.locator('#more-menu > summary').click();
  await expect(page.locator('#docs-open')).toHaveText('Docs');
});

test('a late sign-in answer cannot put the splash back over an app that already loaded', async ({ page }) => {
  let answered = false;
  await page.route('**/api/session', async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    // An older server: no access flag at all.
    await route.fulfill({ json: { sign_in: 'password', user: null } });
    answered = true;
  });
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect.poll(() => answered).toBe(true);
  await expect(page.locator('#unlock')).toBeHidden();
  await page.getByLabel('Message', { exact: true }).fill('Still usable');
  await expect(page.locator('#send')).toBeEnabled();
});

const reply = route => route.fulfill({ contentType: 'application/x-ndjson', body: '{"delta":"Hi"}\n{"done":true}\n' });
async function ask(page, text) {
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.locator('#send').click();
  await expect(page.locator('article.msg[data-provider]')).toHaveCount(1);
  await expect(page.locator('#send')).toBeEnabled();
}
async function earlierChats(page) {
  if (!(await page.locator('#local-chats').isVisible())) await page.locator('#menu').click();
  return page.locator('#local-chats .chat-item');
}

test('opening the app starts a new chat and keeps the last one in the list; reloading the tab keeps it open', async ({ page, context }) => {
  await page.route('**/api/chat', reply);
  await page.goto('/');
  await expect(page.locator('#send')).toBeEnabled();
  await ask(page, 'Plan the garden');
  await page.reload();
  await expect(page.locator('.msg-user')).toContainText('Plan the garden');

  // A new tab is a fresh opening of the app.
  const opened = await context.newPage();
  await opened.route('**/api/title', route => route.fulfill({ status: 503, json: { error: 'Naming unavailable in this fixture' } }));
  await opened.route('**/api/conclave?action=status', route => route.fulfill({ json: { available: false } }));
  await opened.route('**/api/models', route => route.fulfill({ json: catalog }));
  await opened.goto('/');
  await expect(opened.locator('#send')).toBeEnabled();
  await expect(opened.locator('#empty')).toBeVisible();
  await expect(opened.locator('.msg-user')).toHaveCount(0);
  const earlier = (await earlierChats(opened)).filter({ hasText: 'Plan the garden' });
  await expect(earlier).toHaveCount(1);
  await earlier.click();
  await expect(opened.locator('.msg-user')).toContainText('Plan the garden');
});

test('device chats stay with the Google account that made them', async ({ page, context }) => {
  let email = 'ada@example.com';
  const prepare = async target => {
    await target.route('**/api/title', route => route.fulfill({ status: 503, json: { error: 'Naming unavailable in this fixture' } }));
    await target.route('**/api/conclave?action=status', route => route.fulfill({ json: { available: false } }));
    await target.route('**/api/models', route => route.fulfill({ json: catalog }));
    await target.route('**/api/chat', reply);
    await target.route('**/api/session', route => route.fulfill({ json: { sign_in: 'google', user: { email }, access: true } }));
  };
  await prepare(page);
  await page.goto('/');
  await expect(page.locator('#send')).toBeEnabled();
  await ask(page, "Ada's private note");
  await newChat(page);
  await ask(page, "Ada's open question");
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /^converse-(chat|archive)/.test(key)).sort()))
    .toEqual(['converse-archive:ada@example.com', 'converse-chat:ada@example.com']);

  // Another account in the same tab: the saved open chat is put away before anything of Ada's stays on screen.
  email = 'Grace@Example.com';
  await page.reload();
  await expect(page.locator('#status')).toHaveText(/Ready|New chat/);
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#chat')).not.toContainText('Ada');
  await expect(page.locator('#local-chats .chat-item')).toHaveCount(0);
  await ask(page, "Grace's own chat");

  // Ada again, opening the app afresh: a new chat, with both of hers and none of Grace's.
  email = 'ada@example.com';
  const adas = await context.newPage();
  await prepare(adas);
  await adas.goto('/');
  await expect(adas.locator('#send')).toBeEnabled();
  await expect(adas.locator('#empty')).toBeVisible();
  const list = await earlierChats(adas);
  await expect(list).toHaveCount(2);
  await expect(list.filter({ hasText: "Ada's private note" })).toHaveCount(1);
  await expect(list.filter({ hasText: "Ada's open question" })).toHaveCount(1);
  await expect(adas.locator('#sidebar')).not.toContainText('Grace');
});

test('chats saved before accounts were separated go to the first account that signs in', async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ json: { sign_in: 'google', user: { email: 'ada@example.com' }, access: true } }));
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    const chat = (id, text) => ({ schema_version: 1, conversation_id: id, created_at: '2026-10-01T00:00:00.000Z', title: text, attachments: [],
      messages: [{ message_id: 'm_' + id, role: 'user', content: text, timestamp: '2026-10-01T00:00:00.000Z' }] });
    localStorage.setItem('converse-chat', JSON.stringify(chat('conv_open', 'Earlier open chat')));
    localStorage.setItem('converse-archive', JSON.stringify([{ ...chat('conv_old', 'Earlier archived chat'), archived_at: '2026-10-01T00:00:00.000Z' }]));
  });
  await page.goto('/');
  await expect(page.locator('#send')).toBeEnabled();
  await expect(page.locator('#empty')).toBeVisible();
  const list = await earlierChats(page);
  await expect(list).toHaveCount(2);
  await expect(list.filter({ hasText: 'Earlier open chat' })).toHaveCount(1);
  await expect(list.filter({ hasText: 'Earlier archived chat' })).toHaveCount(1);
  expect(await page.evaluate(() => [localStorage.getItem('converse-chat'), localStorage.getItem('converse-archive')])).toEqual([null, null]);
});

test('a sign-in return that does not complete is retried once without another click', async ({ page }) => {
  let signedIn = false, starts = 0, succeedOn = 2;
  await page.route('**/api/models', route => route.fulfill(signedIn ? { json: catalog } : { status: 401, json: { error: 'Sign in to continue.' } }));
  await page.route('**/api/session', route => {
    if (route.request().method() !== 'POST')
      return route.fulfill({ json: { sign_in: 'google', user: signedIn ? { email: 'new@example.com' } : null, access: signedIn } });
    // The returned address stands in for the round trip through Google.
    if (++starts >= succeedOn) { signedIn = true; return route.fulfill({ json: { url: '/' } }); }
    return route.fulfill({ json: { url: '/?signin=failed' } });
  });
  await page.goto('/');
  await page.locator('#google-sign-in').click();
  // The first return fails; the second pass starts by itself and lands in the app.
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(page.locator('#unlock')).toBeHidden();
  expect(starts).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem('converse-signin-retry'))).toBe(null);

  // When the second pass fails too it stops and says so, ready for a manual try.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  signedIn = false; starts = 0; succeedOn = 99;
  await page.goto('/');
  await page.locator('#google-sign-in').click();
  await expect(page.locator('#unlock-error')).toHaveText('Google sign-in did not complete. Try again.');
  await expect(page.locator('#unlock-error')).not.toHaveClass(/pending/);
  await expect(page.locator('#google-sign-in')).toBeEnabled();
  await expect(page).toHaveURL(/\/$/);
  expect(starts).toBe(2);
  // A manual try gets its own single retry.
  await page.locator('#google-sign-in').click();
  await expect(page.locator('#unlock-error')).toHaveText('Google sign-in did not complete. Try again.');
  expect(starts).toBe(4);
});
