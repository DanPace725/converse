import { test, expect } from "@playwright/test";
const catalog = {
  GPT: { models: ["gpt-6-astra", "gpt-4o-2024-11-20"] },
  Claude: { models: ["claude-sonnet-5"] },
  Gemini: { models: ["gemini-3.1-pro-preview"] },
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/models", (r) => r.fulfill({ json: catalog }));
});
async function openModels(page) {
  if (
    !(await page
      .locator("#model-panel")
      .getAttribute("open")
      .then((x) => x !== null))
  )
    await page.locator("#model-panel summary").click();
}
test("model selection survives reload and layout fits the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await openModels(page);
  await page
    .getByLabel("GPT model", { exact: true })
    .selectOption("gpt-4o-2024-11-20");
  await page.reload();
  await openModels(page);
  await expect(page.getByLabel("GPT model", { exact: true })).toHaveValue(
    "gpt-4o-2024-11-20",
  );
  await page.locator("#model-panel summary").click();
  await expect(page.locator("#send")).toBeInViewport();
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
  await page
    .locator("#markdown-file")
    .setInputFiles({
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
  await page.locator("#export").click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
  page.on("dialog", (d) => d.accept());
  await page.locator("#new-chat").click();
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

test.describe('installed app shell',()=>{
 test.use({serviceWorkers:'allow'});
 test('saved conversation opens offline after shell installation',async({page,context})=>{
  await page.goto('/');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;localStorage.setItem('converse-chat',JSON.stringify([{role:'user',content:'Saved offline note'}]));});
  await page.reload();
  await expect(page.locator('article')).toContainText('Saved offline note');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('article')).toContainText('Saved offline note');
  await expect(page.locator('#export')).toBeEnabled();
 });
});
