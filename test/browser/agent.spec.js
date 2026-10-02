import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Store, segment } from "../../lib/conclave/store.js";
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

for (const mode of ["Context", "Agent"]) {
  test(`direct workspace upload in ${mode} stays out of chat until referenced and survives reload`, async ({ page }, testInfo) => {
    let calls = 0;
    const content = "# Uploaded research\n" + "Evidence café 🌱.\n".repeat(700) + "END OF UPLOADED DOCUMENT";
    const app = await fixture(async payload => {
      calls++;
      if (calls === 1) {
        const manifest = JSON.parse(payload.input[1].content.split("\n")[1]);
        expect(manifest[0].path).toBe("Research_notes.md");
        const working = JSON.parse(payload.input[0].content.split("\n")[1]);
        expect(working.at(-1).content).toContain('Workspace document: "Research_notes.md"');
        expect(JSON.stringify(payload.input)).not.toContain("END OF UPLOADED DOCUMENT");
        return response([call("workspace_read", { path: "Research_notes.md", offset: 0 }, 1)]);
      }
      if (calls === 2) return response([call("workspace_read", { path: "Research_notes.md", offset: 8000 }, 2)]);
      expect(payload.input.at(-1).output).toContain("END OF UPLOADED DOCUMENT");
      return final;
    });
    try {
      await page.goto(app.url);
      await expect(page.locator("#workspace-open")).toBeVisible();
      await page.getByRole("radio", { name: mode, exact: true }).check();
      await page.locator("#workspace-open").click();
      await page.locator("#editor-upload-file").setInputFiles({ name: "Research notes.md", mimeType: "text/markdown", buffer: Buffer.from(content) });
      await expect(page.locator("#editor-upload-status")).toContainText("Uploaded Research_notes.md");
      await expect(page.locator("#editor-preview")).toContainText("END OF UPLOADED DOCUMENT");
      const id = app.service.list()[0].conversation_id;
      expect(app.service.view(id).messages).toHaveLength(0);
      expect(app.service.view(id).context.segments).toHaveLength(0);
      expect(calls).toBe(0);
      await page.reload();
      await expect(page.getByRole("radio", { name: mode, exact: true })).toBeChecked();
      await page.locator("#workspace-open").click();
      await expect(page.locator("#editor-preview")).toContainText("END OF UPLOADED DOCUMENT");
      const download = page.waitForEvent("download");
      await page.locator("#editor-download").click();
      const stream = await (await download).createReadStream();
      const chunks = []; for await (const chunk of stream) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe(content);
      await page.screenshot({ path: testInfo.outputPath("workspace-upload.png") });
      await page.locator("#editor-use").click();
      await expect(page.getByLabel("Message", { exact: true })).toHaveValue('Workspace document: "Research_notes.md"');
      expect(calls).toBe(0);
      expect(app.service.view(id).messages).toHaveLength(0);
      await page.getByLabel("Message", { exact: true }).fill('Summarize the evidence.\nWorkspace document: "Research_notes.md"');
      await page.locator("#send").click();
      await expect(page.locator("#send")).toBeEnabled();
      expect(calls).toBe(3);
      expect(app.service.view(id).messages).toHaveLength(2);
      expect(app.service.view(id).workspace[0].content).toBe(content);
    } finally { await app.close(); }
  });
}

test("workspace upload validation preserves saved content and does not send rejected documents", async ({ page }) => {
  const app = await fixture(async () => { throw Error("No model calls expected"); });
  try {
    await page.goto(app.url);
    await expect(page.locator("#workspace-open")).toBeVisible();
    await page.locator("#workspace-open").click();
    const file = (name, buffer) => page.locator("#editor-upload-file").setInputFiles({ name, mimeType: "text/plain", buffer });
    await file("notes.txt", Buffer.from("Keep the original"));
    await expect(page.locator("#editor-upload-status")).toContainText("Uploaded notes.txt");
    await file("notes.txt", Buffer.from("Overwrite"));
    await expect(page.locator("#editor-upload-status")).toContainText("already exists");
    await expect(page.locator("#editor-preview")).toHaveText("Keep the original");
    for (const [name, buffer, error] of [
      ["large.md", Buffer.alloc(100001, "x"), "100 KB"],
      ["doc.pdf", Buffer.from("%PDF"), "Markdown or plain text"],
      ["invalid.txt", Buffer.from([0xff]), "UTF-8"],
    ]) {
      await file(name, buffer);
      await expect(page.locator("#editor-upload-status")).toContainText(error);
    }
    const id = app.service.list()[0].conversation_id;
    expect(app.service.view(id).workspace).toHaveLength(1);
    expect(app.service.view(id).messages).toHaveLength(0);
    expect(app.service.view(id).metrics.calls).toBe(0);
  } finally { await app.close(); }
});

test('Workspace identifies authors, labels legacy excerpts, and opens original context and state corrections', async ({ page }, testInfo) => {
  let calls = 0;
  const content = '# Full notes\n' + 'Detailed evidence. '.repeat(180) + '\nEND OF ORIGINAL';
  const app = await fixture(async () => {
    calls++;
    if (calls === 1) return response([call('workspace_write', { path: 'notes.md', content, expected_source_event_id: null }, 1)]);
    if (calls === 2) return response([call('workspace_read', { path: 'notes.md', offset: 0 }, 2)]);
    return final;
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const id = app.service.create('Context audit proof').conversation_id;
    await app.service.ask(id, { message_id: 'msg_doc', content: 'Write and verify the notes.', settings: { model: 'fixture', jev: false } });
    const h = app.service.harness(id), store = app.service.store;
    const file = app.service.workspaceFile(id, 'notes.md');
    const current = store.context(id);
    const legacy = segment(`Workspace notes.md; source ${file.source_event_id}.\n${content.slice(0, 2000)}`, [file.source_event_id], { type: 'evidence' });
    store.commit(id, [...current.segments.filter(s => !s.source_event_ids.includes(file.source_event_id)), legacy], 'Legacy excerpt fixture', current.revision);
    h.remember('budget', 'constraint', 'Budget: 100 dollars.');
    h.remember('budget', 'constraint', 'Budget: 150 dollars.');
    h.addMessage('assistant', 'Long historical observation. '.repeat(150) + 'END OF HISTORY');
    h.offload([store.context(id).segments.at(-1).id]);
    const revision = store.context(id).revision;
    await page.goto(app.url);
    if (page.viewportSize().width < 900) await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Context audit proof' }).click();
    await page.locator('#workspace-open').click();
    await expect(page.locator('#editor-meta')).toContainText('Last edit by GPT · fixture');
    await expect(page.locator('#editor-preview')).toContainText('END OF ORIGINAL');
    await page.getByRole('tab', { name: 'Context', exact: true }).click();
    const legacyItem = page.locator('#editor-items details').filter({ hasText: 'Workspace notes.md;' });
    await legacyItem.locator('summary').click();
    await legacyItem.getByRole('button', { name: 'Open section' }).click();
    await expect(page.locator('#editor-meta')).toContainText('Partial excerpt: first 2000 characters');
    await expect(page.locator('#editor-preview')).not.toContainText('END OF ORIGINAL');
    const reference = page.locator('#editor-items details').filter({ hasText: 'Offloaded assistant' });
    await reference.locator('summary').click();
    await reference.getByRole('button', { name: 'Open section' }).click();
    await expect(page.locator('#editor-preview')).toContainText('Source excerpt (not a summary)');
    await page.locator('#editor-reference').click();
    await expect(page.locator('#editor-preview')).toContainText('END OF HISTORY');
    await expect(page.locator('#editor-meta')).toContainText('read only');
    await expect(page.locator('#editor-edit')).toBeHidden();
    await page.getByRole('tab', { name: 'State', exact: true }).click();
    await expect(page.locator('#editor-preview')).toHaveText('Budget: 150 dollars.');
    await page.locator('#editor-history summary').click();
    await page.locator('#editor-history-items button').click();
    await expect(page.locator('#editor-preview')).toHaveText('Budget: 100 dollars.');
    await expect(page.locator('#editor-meta')).toContainText('read only');
    await expect(page.locator('#editor-edit')).toBeHidden();
    expect(app.service.view(id).state.entries[0].content).toBe('Budget: 150 dollars.');
    expect(store.context(id).revision).toBe(revision);
    await page.screenshot({ path: testInfo.outputPath('context-audit.png') });
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

for (const mode of ['context', 'agent']) test(`${mode} reasoning streams before answers, retains earlier tool steps and reloads without exposing signatures`, async ({ page }, testInfo) => {
  let release, calls = 0;
  const gate = new Promise(resolve => release = resolve);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const app = await fixture(async (_payload, options) => {
    calls++;
    const text = calls === 1 ? 'Check <img src=x onerror=alert(1)> safely.' : 'Calculation verified.';
    options.onReasoning({ delta: text, block: '0' });
    if (calls === 1) await gate;
    const reasoning = { type: 'reasoning', summary: [{ type: 'summary_text', text }], encrypted_content: 'opaque-secret' };
    if (calls === 1) return response([reasoning, call('calculate', { operation: 'add', values: [1, 2] }, 'reasoning')]);
    options.onDelta('Verified answer.');
    return response([reasoning, messageForTest('Verified answer.')]);
  });
  await page.route('**/api/title', route => route.fulfill({ json: { title: 'Reasoning proof' } }));
  try {
    await page.goto(app.url);
    await expect(page.locator('#mode-switch')).toBeVisible();
    await page.locator(`#mode-switch label:has(input[value="${mode}"])`).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Calculate and explain.');
    await page.locator('#send').click();
    const live = page.locator('article[data-provisional="true"] .reasoning-summary');
    await expect(live).toHaveCount(1);
    expect(await live.evaluate(el => el.open)).toBe(false);
    await live.locator('summary').click();
    await expect(live).toContainText('Check <img');
    expect(await live.locator('img').count()).toBe(0);
    release();
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('article[data-provisional="true"]')).toHaveCount(0);
    const saved = page.locator('.reasoning-summary');
    await expect(saved).toHaveCount(2);
    await expect(page.locator('article[data-provider] .content')).toHaveText('Verified answer.');
    expect(await saved.first().evaluate(el => el.open)).toBe(true);
    await expect(page.locator('#chat')).not.toContainText('opaque-secret');
    const id = app.service.list()[0].conversation_id;
    expect(app.service.view(id).messages[0].reasoning).toHaveLength(2);
    expect(JSON.stringify(app.service.export(id))).toContain('opaque-secret');
    await page.reload();
    await expect(saved).toHaveCount(2);
    await saved.last().locator('summary').click();
    await expect(saved.last()).toContainText('Calculation verified.');
    await page.screenshot({ path: `.agent-smoke/reasoning-${mode}-${testInfo.project.name}.png` });
    expect(errors).toEqual([]);
  } finally { release(); await app.close(); }
});

for (const mode of ['context', 'agent']) test(`${mode} interrupted reasoning remains partial after reload without inventing an answer`, async ({ page }) => {
  const app = await fixture(async (_payload, options) => {
    options.onReasoning({ delta: 'Unfinished rationale.', block: '0' });
    throw Error('Connection ended in reasoning');
  });
  await page.route('**/api/title', route => route.fulfill({ json: { title: 'Interrupted reasoning' } }));
  try {
    await page.goto(app.url);
    await expect(page.locator('#mode-switch')).toBeVisible();
    await page.locator(`#mode-switch label:has(input[value="${mode}"])`).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Think about the request.');
    await page.locator('#send').click();
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('.reasoning-summary')).toHaveCount(1);
    await expect(page.locator('.reasoning-summary summary')).toContainText('partial');
    await page.reload();
    await expect(page.locator('.reasoning-summary')).toHaveCount(1);
    await page.locator('.reasoning-summary summary').click();
    await expect(page.locator('.reasoning-summary')).toContainText('Unfinished rationale.');
    const id = app.service.list()[0].conversation_id;
    expect(app.service.view(id).messages.filter(m => m.role === 'assistant')).toHaveLength(0);
  } finally { await app.close(); }
});

for (const mode of ['context', 'agent']) for (const provider of ['openai', 'anthropic'])
test(`${mode} ${provider} streams provisional text before saving the completed answer`, async ({ page }) => {
  let release;
  const gate = new Promise(resolve => release = resolve);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const app = await fixture(async (payload, options) => {
    expect(typeof options.onDelta).toBe('function');
    options.onDelta('**Live** 🌱');
    await gate;
    options.onDelta(' answer.');
    return { ...response([{ type: 'message', content: [{ type: 'output_text', text: '**Live** 🌱 answer.' }] }]), model: payload.model };
  }, { claude: true });
  await page.route('**/api/title', route => route.fulfill({ json: { title: 'Streaming proof' } }));
  try {
    await page.goto(app.url);
    await expect(page.locator('#mode-switch')).toBeVisible();
    await page.locator(`#mode-switch label:has(input[value="${mode}"])`).click();
    if (provider === 'anthropic') await page.locator('#recipients [data-name="Claude"]').click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Please answer.');
    await page.locator('#send').click();
    const live = page.locator('article[data-provisional="true"]');
    await expect(live.locator('strong').last()).toHaveText('Live');
    await expect(live).toContainText('🌱');
    await expect(page.locator('#send')).toBeDisabled();
    const id = app.service.list()[0].conversation_id;
    expect(app.service.view(id).messages.filter(m => m.role === 'assistant')).toHaveLength(0);
    release();
    await expect(page.locator('#send')).toBeEnabled();
    await expect(live).toHaveCount(0);
    await expect(page.locator('article[data-provider] .content')).toHaveText('Live 🌱 answer.');
    const saved = app.service.view(id).messages.at(-1);
    expect(saved.content).toBe('**Live** 🌱 answer.');
    expect(saved.provider).toBe(provider === 'anthropic' ? 'Claude' : 'GPT');
    expect(saved.usage.output_tokens).toBe(10);
    await page.reload();
    await expect(page.locator('article[data-provider] .content')).toHaveText('Live 🌱 answer.');
    expect(errors).toEqual([]);
  } finally { release(); await app.close(); }
});

test('desktop panel resizing persists and Context expands without a short nested scroll area', async ({ page }, testInfo) => {
  const app = await fixture(async () => final);
  const id = app.service.create('Panel proof').conversation_id;
  const longText = 'Full working context. '.repeat(80) + 'END OF SECTION';
  app.service.harness(id).addMessage('user', longText);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('.chat-item').filter({ hasText: 'Panel proof' }).click();
    await expect(page.locator('#workspace-open')).toBeVisible();
    await page.locator('#workspace-open').click();
    await page.locator('#tab-context').click();
    const detail = page.locator('#editor-items details').first();
    await detail.locator('summary').click();
    await expect(detail.locator('p')).toContainText('END OF SECTION');
    expect(await page.locator('#editor-items').evaluate(el => getComputedStyle(el).maxHeight)).toBe('none');
    if (testInfo.project.name === 'mobile') {
      await expect(page.locator('#workspace-resize')).toBeHidden();
      await expect(page.locator('#chats-resize')).toBeHidden();
      expect(await page.locator('#workspace-editor').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
    } else {
      const workspace = page.locator('#workspace-editor');
      const start = await workspace.boundingBox();
      const edge = await page.locator('#workspace-resize').boundingBox();
      await page.mouse.move(edge.x + 4, edge.y + 250);
      await page.mouse.down();
      await page.mouse.move(edge.x - 100, edge.y + 250, { steps: 5 });
      await page.mouse.up();
      await expect(workspace).toHaveCSS('width', `${start.width + 104}px`);
      await page.locator('#workspace-resize').press('ArrowLeft');
      await expect(workspace).toHaveCSS('width', `${start.width + 114}px`);
      await page.locator('#workspace-resize').press('Shift+ArrowRight');
      await expect(workspace).toHaveCSS('width', `${start.width + 64}px`);
      await page.locator('#chats-resize').press('Shift+ArrowRight');
      await expect(page.locator('#sidebar')).toHaveCSS('width', '330px');
      await page.reload();
      await page.locator('#workspace-open').click();
      await expect(workspace).toBeVisible();
      await expect(workspace).toHaveCSS('width', `${start.width + 64}px`);
      await expect(page.locator('#sidebar')).toHaveCSS('width', '330px');
      await page.locator('#tab-context').click();
      await page.locator('#editor-items details').first().locator('summary').click();
      await page.screenshot({ path: 'docs/reports/assets/issue-10-desktop.png' });
      await page.locator('#editor-close').click();
      await page.locator('#context-panel > summary').click();
      const sheet = page.locator('#context-panel > .sheet');
      const width = (await sheet.boundingBox()).width;
      await page.locator('#settings-resize').press('Shift+ArrowRight');
      await expect(sheet).toHaveCSS('width', `${width - 50}px`);
      const height = (await sheet.boundingBox()).height;
      await page.locator('#settings-height-resize').press('ArrowUp');
      expect((await sheet.boundingBox()).height).toBeGreaterThan(height);
      await page.locator('#settings-height-resize').press('Home');
      expect(await sheet.evaluate(el => getComputedStyle(el).getPropertyValue('--settings-height'))).toBe('');
      await page.locator('#sheet-close').click();
      await page.locator('#context-watch').click();
      const gardenWidth = (await page.locator('#context-garden').boundingBox()).width;
      await page.locator('#garden-resize').press('ArrowLeft');
      await expect(page.locator('#context-garden')).toHaveCSS('width', `${gardenWidth + 10}px`);
      await page.locator('#garden-close').click();
      await page.locator('#workspace-open').click();
      await page.setViewportSize({ width: 1200, height: 800 });
      await expect.poll(async () => (await page.locator('main').boundingBox()).width).toBeGreaterThanOrEqual(480);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('#workspace-resize')).toBeHidden();
      await expect(workspace).toHaveCSS('width', '390px');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

for (const mode of ['context', 'agent']) test(`${mode} replaces tool previews and discards failed streaming text`, async ({ page }) => {
  let calls = 0, fail = false, release;
  const gate = new Promise(resolve => release = resolve);
  const app = await fixture(async (_payload, { onDelta }) => {
    calls++;
    if (fail) { onDelta('Unfinished answer'); throw Error('stream ended unexpectedly'); }
    if (calls === 1) {
      onDelta('Tool preview');
      return response([messageForTest('Tool preview'), call('calculate', { operation: 'add', values: [1, 2] }, 'stream')]);
    }
    onDelta('Final answer');
    await gate;
    return response([messageForTest('Final answer')]);
  });
  await page.route('**/api/title', route => route.fulfill({ json: { title: 'Preview proof' } }));
  try {
    await page.goto(app.url);
    await expect(page.locator('#mode-switch')).toBeVisible();
    await page.locator(`#mode-switch label:has(input[value="${mode}"])`).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Calculate 1 + 2.');
    await page.locator('#send').click();
    await expect(page.locator('article[data-provisional] .content')).toHaveText('Final answer');
    await expect(page.locator('#chat')).not.toContainText('Tool preview');
    release();
    await expect(page.locator('#send')).toBeEnabled();
    const id = app.service.list()[0].conversation_id;
    expect(app.service.view(id).messages.at(-1).content).toBe('Final answer');
    expect(app.service.export(id).events.filter(e => e.kind === 'inference_request').every(e => e.metadata.stream)).toBe(true);
    fail = true;
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Answer again.');
    await page.locator('#send').click();
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('article[data-provisional]')).toHaveCount(0);
    await expect(page.locator('#chat')).not.toContainText('Unfinished answer');
    expect(app.service.view(id).messages.filter(m => m.role === 'assistant')).toHaveLength(1);
    await page.reload();
    await expect(page.locator('article[data-provider] .content')).toHaveText('Final answer');
  } finally { release(); await app.close(); }
});
const messageForTest = text => ({ type: 'message', content: [{ type: 'output_text', text }] });

for (const mode of ['context', 'agent']) test(`${mode} saves generated names and resends edited user messages with math responses`, async ({ page }) => {
  const app = await fixture(async () => response([
    { type: 'message', content: [{ type: 'output_text', text: String.raw`The result is \(3 + 3 = 6\).` }] },
  ]));
  const titles = [];
  await page.route('**/api/title', async route => {
    titles.push(route.request().postDataJSON());
    await route.fulfill({ json: { title: 'Arithmetic Review', usage: { output_tokens: 3 } } });
  });
  try {
    await page.goto(app.url);
    await expect(page.locator('#mode-switch')).toBeVisible();
    await page.locator(`#mode-switch label:has(input[value="${mode}"])`).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Calculate 2 + 2.');
    await page.locator('#send').click();
    await expect(page.locator('#chat-title')).toHaveText('Arithmetic Review');
    await expect(page.locator('article .katex')).toHaveCount(1);
    await page.locator('.msg-user').first().getByRole('button', { name: 'Edit your message' }).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Calculate 3 + 3.');
    await page.locator('#send').click();
    await expect(page.locator('.msg-user')).toHaveCount(2);
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('#message-edit')).toBeHidden();
    const id = app.service.list()[0].conversation_id;
    const saved = app.service.view(id);
    expect(saved.title).toBe('Arithmetic Review');
    expect(saved.messages[2].revises_message_id).toBe(saved.messages[0].message_id);
    expect(saved.messages[0].content).toBe('Calculate 2 + 2.');
    await page.reload();
    await expect(page.locator('#chat-title')).toHaveText('Arithmetic Review');
    await expect(page.locator('.msg-user')).toHaveCount(2);
    expect(titles).toHaveLength(1);
  } finally { await app.close(); }
});

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
    // Keyboard activation avoids overlapping decorative SVG auras intercepting clicks.
    await page.locator('#garden-nodes [role="button"]').first().focus();
    await page.locator('#garden-nodes [role="button"]').first().press('Enter');
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

test('fixed token guard explains its reserve beside the composer and automatic testing needs no numeric limits', async ({page}, testInfo) => {
  let calls = 0;
  const app = await fixture(async () => {
    calls++;
    return {...(calls >= 6 ? final : response([call('calculate', {operation: 'add', values: [1, 2]}, calls)])),
      usage: {input_tokens: 50000, output_tokens: 10}};
  });
  try {
    await openAgent(page, app.url);
    await page.locator('#context-panel > summary').click();
    await page.locator('#agent-panel > summary').click();
    await expect(page.locator('#agent-limit-mode')).toHaveValue('adaptive');
    await expect(page.locator('#agent-tokens')).toBeDisabled();
    await page.locator('#agent-limit-mode').selectOption('fixed');
    await page.locator('#agent-tokens').fill('1000');
    await page.locator('#sheet-close').click();
    await page.getByLabel('Message', {exact: true}).fill('Calculate six times.');
    await page.locator('#send').click();
    await expect(page.locator('#agent-notice')).toBeVisible();
    await expect(page.locator('#agent-notice')).toContainText('0 reported tokens');
    await expect(page.locator('#agent-notice')).toContainText('above the 1000 allowance');
    expect(calls).toBe(0);
    await page.screenshot({path: testInfo.outputPath('token-guard.png'), fullPage: true});
    await page.reload();
    await expect(page.locator('#agent-notice')).toContainText('above the 1000 allowance');
    await expect(page.locator('#agent-limit-mode')).toHaveValue('fixed');
    await page.locator('#context-panel > summary').click();
    await page.locator('#agent-panel > summary').click();
    await page.locator('#agent-limit-mode').selectOption('adaptive');
    await expect(page.locator('#agent-tokens')).toBeDisabled();
    await page.locator('#sheet-close').click();
    await page.getByLabel('Message', {exact: true}).fill('Continue the calculation with automatic limits.');
    await page.locator('#send').click();
    await expect(page.locator('#agent-status')).toContainText('completed');
    await expect(page.locator('#agent-status')).toContainText('automatic limit increases');
    expect(calls).toBe(6);
    const id = app.service.list()[0].conversation_id, agent = app.service.view(id).agent;
    expect(agent.limit_mode).toBe('adaptive');
    expect(agent.limits.max_total_tokens).toBe(500000);
    expect(agent.input_tokens).toBe(300000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {await app.close();}
});

test('provider rejection remains visible in the transcript and beside run controls after reload', async ({page}) => {
  const app = await fixture(async () => {throw Error('OpenAI 400: unsupported reasoning fixture');});
  try {
    await openAgent(page, app.url);
    await page.getByLabel('Message', {exact: true}).fill('Write a report.');
    await page.locator('#send').click();
    await expect(page.locator('#agent-notice')).toContainText('OpenAI 400: unsupported reasoning fixture');
    await expect(page.locator('#chat .error')).toContainText('unsupported reasoning fixture');
    await page.reload();
    await expect(page.locator('#agent-notice')).toBeVisible();
    await expect(page.locator('#chat .error')).toContainText('unsupported reasoning fixture');
  } finally {await app.close();}
});

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
