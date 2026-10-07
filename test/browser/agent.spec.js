import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Store, segment } from "../../lib/conclave/store.js";
import { ConclaveService } from "../../lib/conclave/service.js";
import { createConclaveHandler } from "../../lib/conclave-local.js";
import { SQLiteEmbeddingStore } from "../../lib/conclave/embedding-store.js";
import { retrievalCatalog } from "../../lib/conclave/semantic-retrieval.js";
import { exportFilename } from '../../public/export-name.js';

test('saved chats and reload use transcripts, while Workspace loads authoritative details on demand', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const app = await fixture(async () => final);
  const id = app.service.create('Fast saved chat').conversation_id;
  await app.service.ask(id, { message_id: 'fast_one', content: 'Keep this saved message.', settings: { model: 'fixture', jev: false } });
  await app.service.saveDocument(id, { path: 'notes.md', content: '# Saved details', expected_source_event_id: null });
  const other = app.service.create('Other saved chat').conversation_id;
  await app.service.ask(other, { message_id: 'other_one', content: 'Second conversation.', settings: { model: 'fixture', jev: false } });
  await app.service.saveDocument(other, { path: 'second.md', content: '# Second file', expected_source_event_id: null });
  let completeViews = 0;
  const viewReads = [];
  const original = app.service.view.bind(app.service);
  app.service.view = (...args) => { completeViews++; viewReads.push(args[0]); return original(...args); };
  try {
    await page.route('**/api/title', route => route.fulfill({ status: 503, json: { error: 'Naming disabled in fixture' } }));
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Fast saved chat' }).click();
    await expect(page.locator('#chat')).toContainText('Keep this saved message.');
    await expect(page.locator('#context-stats')).toContainText('details load in Workspace');
    expect(completeViews).toBe(0);
    await page.reload();
    await expect(page.locator('#chat')).toContainText('Keep this saved message.');
    await expect(page.locator('#send')).toBeEnabled();
    expect(completeViews).toBe(0);
    await page.locator('#workspace-open').click();
    await expect(page.locator('#editor-items')).toContainText('notes.md');
    await page.locator('#editor-items button').filter({ hasText: 'notes.md' }).click();
    await expect(page.locator('#editor-preview')).toContainText('Saved details');
    expect(completeViews).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('saved-chat-workspace.png'), fullPage: true });
    if (testInfo.project.name === 'desktop') {
      const before = viewReads.length;
      await page.locator('#server-chats .chat-item').filter({ hasText: 'Other saved chat' }).click();
      await expect(page.locator('#editor-preview')).toContainText('Second file');
      expect(viewReads[before]).toBe(other);
      await expect(page.locator('#chat')).toContainText('Second conversation.');
    }
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('Jev has a dedicated Workspace view with outcomes, exact evidence, unknown usage, paging and safe source inspection', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let calls = 0;
  const app = await fixture(async () => { calls++; return final; });
  const id = app.service.create('Jev telemetry proof').conversation_id;
  const store = app.service.store, source = app.service.harness(id).ingestText('archive.md', 'Archive includes 129 participants.');
  for (let n = 0; n < 15; n++) store.append(id, 'retrieval_decision', '', {
    query: 'Earlier search ' + n, outcome: 'skipped', reason: 'shortlist already fits', selected_event_ids: [source.id], baseline_event_ids: [source.id] });
  const request = store.append(id, 'inference_request', 'retrieval-reranking', { provider: 'typesafe', payload: { model: 'jev-fixture' } });
  store.append(id, 'inference_response', 'retrieval-reranking', { request_id: request.id, status: 'failed', error: 'Fixture timeout', elapsed_ms: 35 });
  store.append(id, 'retrieval_decision', '', { query: '<img src=x onerror=alert(1)> participants', outcome: 'selection changed',
    selected_event_ids: [source.id], baseline_event_ids: [], selection_source: 'bounded-model', assessment: { threshold: 0.65,
      decisions: [{ id: source.id, category: 'useful', confidence: 0.9, uncertain: false }] },
    candidates: [{ id: source.id, kind: 'document', excerpt: source.content, source: { title: 'archive.md', sourceRef: 'E1', offset: 0, end_offset: source.content.length } }] });
  try {
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Jev telemetry proof' }).click();
    await page.locator('#workspace-open').click();
    await page.getByRole('tab', { name: 'Jev', exact: true }).click();
    await expect(page.locator('#editor-jev')).toBeVisible();
    await expect(page.locator('#jev-summary')).toContainText('1 attempted · 0 completed · 1 failed');
    await expect(page.locator('#jev-usage')).toContainText('usage unknown for 1 call');
    await page.locator('#jev-records details').first().locator('summary').click();
    await expect(page.locator('#jev-records')).toContainText('confidence 0.9');
    await expect(page.locator('#jev-records')).toContainText('characters 0–34');
    await expect(page.locator('#jev-records img')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('jev-workspace.png'), fullPage: true });
    await page.getByRole('button', { name: 'Open archive.md', exact: true }).click();
    await expect(page.locator('#editor-preview')).toContainText('129 participants');
    await page.locator('#editor-back').click();
    await expect(page.locator('#editor-jev')).toBeVisible();
    await page.locator('#jev-earlier').click();
    await expect(page.locator('#jev-records')).toContainText('Earlier search 0');
    await expect(page.locator('#jev-earlier')).toBeHidden();
    expect(calls).toBe(0); expect(errors).toEqual([]);
    await page.reload();
    await page.locator('#workspace-open').click();
    await page.locator('#tab-jev').click();
    await expect(page.locator('#jev-summary')).toContainText('1 selections changed');
    expect(calls).toBe(0);
  } finally { await app.close(); }
});

test('saved cleanup proposals show stable IDs and require a manual approval without extra inference', async ({ page }, testInfo) => {
  let calls = 0;
  const app = await fixture(async () => { calls++; return final; });
  const id = app.service.create('Reviewable memory cleanup').conversation_id;
  await app.service.ask(id, { message_id: 'cleanup_seed', content: 'Keep the budget under $400.', settings: { model: 'fixture', jev: false } });
  const view = app.service.view(id), record = view.memory.records[0];
  const h = app.service.harness(id, view.settings);
  h.toolResult('propose_memory_suppression', { key: 'budget_cleanup', expected_memory_revision: view.memory.revision,
    expected_state_revision: view.context.revision, targets: [{ kind: 'automatic', id: record.memory_id }] });
  const before = calls;
  try {
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Reviewable memory cleanup' }).click();
    await page.locator('#workspace-open').click();
    await page.locator('[data-tab="state"]').click();
    await expect(page.locator('#memory-graph')).toBeVisible();
    await page.locator('#editor-memory-proposals summary').filter({ hasText: 'budget_cleanup' }).click();
    await expect(page.locator('#editor-memory-proposals')).toContainText(record.memory_id);
    await page.getByRole('button', { name: 'Suppress this entry', exact: true }).click();
    await expect(page.locator('#editor-feedback')).toContainText('Approved entries suppressed');
    expect(app.service.view(id).memory.records[0].lifecycle).toBe('suppressed');
    expect(calls).toBe(before);
  } finally { await app.close(); }
});

test('Jev memory view distinguishes applied selections from optional model comparisons without making calls', async ({ page }, testInfo) => {
  let calls = 0; const errors = []; page.on('pageerror', e => errors.push(e.message));
  const app = await fixture(async () => { calls++; return final; });
  const id = app.service.create('Active Jev memory proof').conversation_id;
  const store = app.service.store;
  const jev = { records: [{ passage_id: 0, kind: 'claim' }] }, llm = { records: [{ passage_id: 2, kind: 'question' }] };
  store.append(id, 'memory_selection', '', { selector: 'jev', jev, deferred_passage_ids: [1] });
  store.append(id, 'memory_selection_applied', '', { selector: 'jev', revision: 1, records: jev.records });
  store.append(id, 'memory_comparison', '', { active_selector: 'jev', applied: false, jev, llm, comparison: { both: 0, kind_matches: 0, jaccard: 0 } });
  try {
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Active Jev memory proof' }).click();
    await page.locator('#workspace-open').click(); await page.locator('#tab-jev').click();
    await expect(page.locator('#jev-summary')).toContainText('1 captures applied · 1 optional task-model comparisons');
    await page.locator('#jev-records details').first().locator('summary').click();
    await expect(page.locator('#jev-records')).toContainText('Task model: ¶2 question · Jev: ¶0 claim');
    await page.locator('#jev-records details').last().locator('summary').click();
    await expect(page.locator('#jev-records')).toContainText('Uncertain or oversized passages left for review: ¶1');
    await page.reload(); await page.locator('#workspace-open').click(); await page.locator('#tab-jev').click();
    await expect(page.locator('#jev-summary')).toContainText('1 captures applied');
    expect(calls).toBe(0); expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('memory garden defaults to a zoomable graph with sources, recorded connections, topics and selection', async ({ page }, testInfo) => {
  let calls = 0; const errors = []; page.on('pageerror', e => errors.push(e.message));
  const app = await fixture(async () => { calls++; return final; });
  const id = app.service.create('Memory garden proof').conversation_id;
  await app.service.ask(id, { message_id: 'garden_seed', content: 'Keep it below $500. Only use staff with clearance if children attend.', settings: { model: 'fixture', jev: false } });
  await app.service.ask(id, { message_id: 'garden_correction', content: 'Correction: keep it below $700.', settings: { model: 'fixture', jev: false } });
  await app.service.remember(id, { key: 'venue', type: 'constraint', content: 'Use an accessible venue.' });
  const original = app.service.view(id).memory.records[0];
  // Persist a larger topic and explicit edges to exercise bounded navigation,
  // rather than paying for optional memory extraction in a browser fixture.
  const records = Array.from({ length: 14 }, (_, n) => ({ ...structuredClone(original), memory_id: 'garden_' + String(n).padStart(2, '0'),
    content: n === 0 ? 'Review the venue decision.' : n === 1 ? 'Keep the access requirement.' : `Retained question ${n} about the venue.`,
    kind: n === 0 ? 'question' : 'claim', lifecycle: 'retained', supersedes: [], conflicts_with: [], depends_on: n === 0 ? ['garden_01'] : [],
    scope: { ...original.scope, topic_id: 'garden_topic', topic_name: 'Venue planning' } }));
  app.service.store.append(id, 'memory_delta', '', { records, changes: [] });
  // Similarity is read from stored vectors, so seed the index directly: two
  // alike questions, a named detail near one memory, and a pair that already
  // has a recorded dependency. The rest stay unindexed.
  const lean = (base, own, weight) => Array.from({ length: 1536 }, (_, i) => i === base ? weight : i === own ? Math.sqrt(1 - weight ** 2) : 0);
  const vectors = { 'Retained question 2 about the venue.': lean(10, 11, 1), 'Retained question 3 about the venue.': lean(10, 12, .9),
    'Keep the access requirement.': lean(20, 21, 1), 'Use an accessible venue.': lean(20, 22, .8), 'Review the venue decision.': lean(20, 23, .6) };
  await new SQLiteEmbeddingStore(app.service.store).put(id, retrievalCatalog(app.service.store, id).items
    .filter(r => r.kind === 'memory' && vectors[r.content]).map(r => ({ ...r, vector: vectors[r.content] })));
  app.service.embeddingEnabled = true; // After seeding: this scenario never embeds.
  const empty = app.service.create('Empty garden proof').conversation_id;
  const before = calls;
  try {
    await page.route('**/api/title', route => route.fulfill({ status: 503, json: { error: 'Naming disabled in fixture' } }));
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Memory garden proof' }).click();
    await page.locator('#workspace-open').click(); await page.locator('#tab-state').click();
    await expect(page.locator('#memory-views [data-view="graph"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#memory-graph')).toBeVisible();
    await expect(page.locator('#editor-items')).toBeHidden();
    // Every memory is on one map: zoomed out it shows shape, closer it shows labels.
    const scene = page.locator('#memory-scene'), scale = () => page.locator('#memory-stage').evaluate(g => +g.getAttribute('transform').match(/scale\(([\d.]+)\)/)[1]);
    const shift = () => page.locator('#memory-stage').evaluate(g => g.getAttribute('transform').match(/translate\(([^)]+)\)/)[1]);
    const openNode = async node => { await node.focus(); await node.press('Enter'); };
    await expect(page.locator('#memory-scene [role="button"]')).toHaveCount(17);
    await expect(page.locator('#memory-scene .memory-edge-depends_on')).toHaveCount(1);
    // Dotted similarity lines are separate from recorded links, which win a shared pair.
    const alike = page.locator('#memory-scene .memory-edge-semantic');
    await expect(alike).toHaveCount(2);
    await expect(page.locator('#memory-graph-status')).toContainText('17 memories · 1 connection · 2 similar');
    await expect(alike.first()).not.toHaveAttribute('marker-end', /arrow/);
    await page.locator('#memory-similar').uncheck();
    await expect(alike).toHaveCount(0);
    await expect(page.locator('#memory-graph-status')).not.toContainText('similar');
    await page.locator('#memory-similar').check();
    await expect(alike).toHaveCount(2);
    await expect(scene).toHaveClass(/memory-far/);
    await page.screenshot({ path: testInfo.outputPath('memory-garden.png'), fullPage: true });
    // Layout starts from each memory's own ID, so the fitted scale varies by run.
    const whole = await scale(), steps = Math.max(3, Math.ceil(Math.log(0.8 / whole) / Math.log(1.4))), near = whole * 1.4 ** steps * 0.99;
    for (let n = 0; n < steps; n++) await page.locator('#memory-zoom-in').click();
    await expect.poll(scale).toBeGreaterThan(near);
    await expect(scene).not.toHaveClass(/memory-far/);
    const box = await scene.boundingBox(), origin = await shift();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);
    await expect.poll(scale).toBeLessThan(near);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 40, { steps: 4 }); await page.mouse.up();
    expect(await shift()).not.toBe(origin);
    await page.locator('#memory-fit').click();
    await expect.poll(scale).toBeCloseTo(whole, 2);
    await page.locator('#memory-topic').selectOption('conversation');
    await expect(scene).toContainText(/keep it below \$700\./i);
    await expect(scene).not.toContainText(/keep it below \$500\./i);
    await page.locator('#memory-history').check();
    await expect(page.locator('#memory-scene .memory-edge-supersedes')).toHaveCount(1);
    // Selecting a memory shows it beside the map; its connections walk the map.
    const budget = scene.getByRole('button', { name: /commitment:.*\$700/ });
    await budget.click();
    await expect(budget).toHaveClass(/memory-selected/);
    await expect(page.locator('#memory-focus-text')).toHaveText(/keep it below \$700\./i);
    await expect(page.locator('#memory-scene .memory-edge-lit')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('memory-corrections.png'), fullPage: true });
    await page.locator('#memory-focus-links button').filter({ hasText: 'Replaces:' }).click();
    await expect(scene.getByRole('button', { name: /commitment:.*\$500/ })).toBeFocused();
    await expect(page.locator('#memory-focus-text')).toHaveText(/keep it below \$500\./i);
    await page.locator('#memory-focus-open').click();
    await expect(page.locator('#editor-preview')).toContainText('$500');
    await expect(page.locator('#editor-edit')).toBeHidden();
    await page.locator('#editor-back').click();
    await expect(scene.getByRole('button', { name: /commitment:.*\$500/ })).toBeFocused();
    // Walking a connection moved the camera; Fit clears the band beside the zoom controls.
    await page.locator('#memory-fit').click();
    await scene.click({ position: { x: 6, y: 6 } });
    await expect(page.locator('#memory-focus')).toBeHidden();
    // A second press on the selected memory opens it.
    await budget.click(); await budget.click();
    await expect(page.locator('#editor-preview')).toContainText('$700');
    await page.locator('#editor-memory-connections button').filter({ hasText: 'Replaces:' }).click();
    await expect(page.locator('#editor-preview')).toContainText('$500');
    await page.locator('#editor-back').click();
    await openNode(budget);
    await page.locator('#editor-memory-suppress').click();
    await expect(page.locator('#editor-meta')).toContainText('suppressed');
    await page.locator('#editor-back').click();
    await expect(budget).toHaveClass(/memory-inactive/);
    await openNode(budget); await page.locator('#editor-memory-suppress').click();
    await expect(page.locator('#editor-meta')).toContainText('retained');
    await page.locator('#editor-memory-sources button').click();
    await expect(page.locator('#editor-preview')).toContainText('Correction: keep it below $700.');
    await page.locator('#editor-back').click();
    await page.locator('#memory-topic').selectOption('named');
    await openNode(scene.getByRole('button', { name: /venue: Use an accessible venue/ }));
    await expect(page.locator('#editor-preview')).toHaveText('Use an accessible venue.');
    await page.locator('#editor-back').click();
    await page.locator('#memory-topic').selectOption('garden_topic');
    await expect(page.locator('#memory-scene [role="button"]')).toHaveCount(14);
    await expect(page.locator('#memory-scene .memory-edge-depends_on')).toHaveCount(1);
    await page.locator('#memory-scene [data-memory-id="garden_00"]').click();
    await page.locator('#memory-focus-links button').filter({ hasText: 'Depends on:' }).click();
    await expect(page.locator('#memory-scene [data-memory-id="garden_01"]')).toBeFocused();
    await expect(page.locator('#memory-focus-text')).toHaveText('Keep the access requirement.');
    await expect(page.locator('#memory-focus-links')).toContainText('Similar (80%): Use an accessible venue.');
    await expect(page.locator('#memory-focus-links')).not.toContainText('Similar (60%)');
    await page.locator('#memory-scene [data-memory-id="garden_02"]').focus();
    await expect(page.locator('#memory-scene .memory-edge-semantic.memory-edge-lit')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('memory-topic.png'), fullPage: true });
    await page.locator('#memory-focus-links button').filter({ hasText: 'Similar (90%)' }).click();
    await expect(page.locator('#memory-scene [data-memory-id="garden_03"]')).toBeFocused();
    await expect(page.locator('#memory-focus-text')).toHaveText('Retained question 3 about the venue.');
    const visited = new Set();
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      visited.add(await page.evaluate(() => document.activeElement.dataset.memoryId));
    }
    expect(visited.size).toBeGreaterThan(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#editor-preview')).toContainText(/venue|access requirement/);
    await page.locator('#editor-back').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#memory-views [data-view="list"]').click();
    await expect(page.locator('#editor-items')).toContainText('Retained question 13');
    await expect(page.locator('#memory-graph')).toBeHidden();
    await page.reload(); await page.locator('#workspace-open').click(); await page.locator('#tab-state').click();
    await expect(page.locator('#memory-views [data-view="graph"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#editor-close').click();
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Empty garden proof' }).click();
    await page.locator('#workspace-open').click(); await page.locator('#tab-state').click();
    await expect(page.locator('#memory-graph-status')).toContainText('No saved memories yet');
    await expect(page.locator('#memory-scene [role="button"]')).toHaveCount(0);
    await expect(page.locator('#memory-canvas')).toBeHidden();
    await expect(page.locator('#memory-similar')).toBeHidden();
    await expect(page.locator('#memory-topic')).toHaveValue('');
    expect(app.service.view(empty).memory.records).toHaveLength(0);
    expect(app.service.store.events(id).some(e => e.kind.startsWith('embedding_'))).toBe(false);
    expect(calls).toBe(before); expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('automatic memory sources, corrections, suppression and restoration are usable after reload', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const app = await fixture(async () => final);
  const id = app.service.create('Automatic memory proof').conversation_id;
  await app.service.ask(id, { message_id: 'memory_browser', content: 'Keep it below $500. Only use staff with clearance if children attend.', settings: { model: 'fixture', jev: false } });
  await app.service.ask(id, { message_id: 'memory_browser_correction', content: 'Correction: keep it below $700.', settings: { model: 'fixture', jev: false } });
  try {
    await page.route('**/api/title', route => route.fulfill({ json: { title: 'Automatic memory proof' } }));
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Automatic memory proof' }).click();
    await page.locator('#workspace-open').click();
    await page.locator('#tab-state').click();
    await page.locator('#memory-views [data-view="list"]').click();
    await expect(page.locator('#editor-items')).toContainText('clearance if children');
    await page.locator('#editor-items button').filter({ hasText: '$700' }).click();
    await expect(page.locator('#editor-meta')).toContainText('Your instruction');
    await expect(page.locator('#editor-meta')).toContainText('this conversation');
    await page.locator('#editor-history > summary').click();
    await page.locator('#editor-history-items button').click();
    await expect(page.locator('#editor-preview')).toContainText('$500');
    await expect(page.locator('#editor-edit')).toBeHidden();
    await page.locator('#editor-back').click();
    await page.locator('#editor-items button').filter({ hasText: '$700' }).click();
    await page.locator('#editor-edit').click();
    await page.locator('#editor-text').fill('Keep it below $800.');
    await page.locator('#editor-save').click();
    await expect(page.locator('#editor-feedback')).toContainText('Saved');
    await expect(page.locator('#editor-preview')).toContainText('$800');
    await page.locator('#editor-memory-suppress').click();
    await expect(page.locator('#editor-meta')).toContainText('suppressed');
    await page.reload();
    await page.locator('#workspace-open').click();
    await page.locator('#tab-state').click();
    await page.locator('#memory-views [data-view="list"]').click();
    await page.locator('#editor-items button').filter({ hasText: '$800' }).click();
    await expect(page.locator('#editor-memory-suppress')).toHaveText('Use this again');
    await page.locator('#editor-memory-suppress').click();
    await expect(page.locator('#editor-meta')).toContainText('retained');
    await page.screenshot({ path: testInfo.outputPath('automatic-memory.png'), fullPage: true });
    await page.locator('#editor-memory-sources button').click();
    await expect(page.locator('#editor-preview')).toContainText('$800');
    await expect(page.locator('#editor-meta')).toContainText('Saved historical text');
    const view = app.service.view(id);
    expect(view.memory.records.filter(r => r.binding && r.lifecycle === 'retained').length).toBe(2);
    expect(view.metrics.calls).toBe(2); // Manual correction/suppression use no model.
    expect(view.memory.records.find(r => r.content.includes('$500')).lifecycle).toBe('superseded');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('capture issues persist after successful turns and a shared memory snapshot is safe to paste back', async ({page}, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let captures = 0;
  const app = await fixture(async payload => {
    if (payload.text?.format?.name === 'memory_candidates') { captures++; throw Error('OpenAI 400: unsupported reasoning fixture'); }
    return final;
  }, {memoryModel:true, memorySelector:'task-model'});
  const id = app.service.create('Memory capture diagnostics').conversation_id;
  const settings = {model:'fixture', jev:false};
  await app.service.ask(id, {message_id:'memory_issue_first',content:'For the budget, perhaps 500 is sensible.',settings});
  await app.service.ask(id, {message_id:'memory_issue_success',content:'Keep the budget under $400.',settings});
  try {
    await page.route('**/api/title', route => route.fulfill({json:{title:'Memory capture diagnostics'}}));
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({hasText:'Memory capture diagnostics'}).click();
    await page.locator('#workspace-open').click(); await page.locator('#tab-state').click();
    await expect(page.locator('#editor-memory-issues-title')).toHaveText('1 memory capture issue');
    await page.locator('#editor-memory-issues > summary').click();
    await expect(page.locator('#editor-memory-issues-list')).toContainText('Automatic retry stopped');
    // Exercise the real download fallback; clipboard availability varies by host.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async()=>{throw Error('Clipboard unavailable');}}}));
    const download = page.waitForEvent('download'); await page.locator('#editor-memory-copy').click();
    const artifact = await download;
    expect(artifact.suggestedFilename()).toBe('memory-snapshot.md');
    const text = await readFile(await artifact.path(), 'utf8');
    const snapshot = JSON.parse(text.split('```json\n')[1].split('\n```')[0]);
    expect(snapshot.inspection_only).toBe(true); expect(snapshot.automatic[0].authority).toBe('user_committed');
    expect(snapshot.automatic[0].source_refs[0].event_id).toBeTruthy(); expect(snapshot.capture_issues).toHaveLength(1);
    await app.service.ask(id, {message_id:'memory_issue_share',content:text,settings});
    expect(app.service.view(id).memory.records).toHaveLength(1); expect(captures).toBe(1);
    await page.reload(); await page.locator('#workspace-open').click(); await page.locator('#tab-state').click();
    await expect(page.locator('#editor-memory-issues-title')).toHaveText('1 memory capture issue');
    await page.locator('#editor-memory-issues > summary').click();
    await page.screenshot({path:testInfo.outputPath('memory-capture-issues.png'),fullPage:true});
    await page.locator('#editor-memory-issues-list button').click();
    await expect(page.locator('#editor-preview')).toContainText('perhaps 500 is sensible');
    expect(errors).toEqual([]);
  } finally {await app.close();}
});

test('a chat request suppresses both memory stores and verifies a batch patch after reload', async ({page}, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let phase = -1, id;
  const app = await fixture(async payload => {
    if (phase < 0) return final;
    const n = phase++, output = payload.input.filter(i => i.type === 'function_call_output').at(-1);
    const invoke = (name, args) => ({...final, output:[{type:'function_call',call_id:'memory-patch-' + n,name,arguments:JSON.stringify(args)}]});
    if (n >= 2) expect(JSON.stringify(payload)).not.toContain('under $400');
    if (n === 0) return invoke('read_memory', {offset:0,expected_memory_revision:null,expected_state_revision:null});
    if (n === 1) {
      const page = JSON.parse(output.output), snapshot = JSON.parse(page.content);
      return invoke('suppress_memory', {expected_memory_revision:page.memory_revision,expected_state_revision:page.state_revision,
        source_event_id:app.service.store.events(id).findLast(e => e.kind === 'user').id,
        targets:[{kind:'automatic',id:snapshot.automatic[0].memory_id},{kind:'named',id:'budget'}]});
    }
    if (n === 2 || n === 4) return invoke('workspace_read', {path:'plan.md',offset:0});
    if (n === 3) return invoke('workspace_patch_batch', {path:'plan.md',expected_source_event_id:JSON.parse(output.output).source_event_id,
      patches:[{find:'Budget: 100',replace:'Budget: 150'},{find:'Guests: 12',replace:'Guests: 10'}]});
    return {...final,output:[{type:'message',content:[{type:'output_text',text:'Memory suppression and two file changes verified.'}]}]};
  });
  id = app.service.create('Unified memory and patches').conversation_id;
  await app.service.ask(id, {message_id:'memory_tools_seed',content:'Keep the budget under $400.',settings:{model:'fixture',jev:false}});
  await app.service.remember(id, {key:'budget',type:'constraint',content:'Keep the budget under $400.'});
  app.service.harness(id).toolResult('workspace_write', {path:'plan.md',expected_source_event_id:null,content:'# Plan\nBudget: 100\nGuests: 12\n## Access\nKeep lift access.'});
  phase = 0;
  try {
    await page.route('**/api/title', route => route.fulfill({json:{title:'Unified memory and patches'}}));
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({hasText:'Unified memory and patches'}).click();
    await page.getByRole('textbox', {name:'Message',exact:true}).fill('Forget the budget memories. Set the plan budget to 150 and guest count to 10, preserving access.');
    await page.locator('#send').click(); await expect(page.locator('#send')).toBeEnabled();
    await expect(page.getByText('Memory suppression and two file changes verified.', {exact:true})).toBeVisible();
    await page.reload(); await page.locator('#workspace-open').click(); await page.locator('#tab-state').click();
    await page.locator('#memory-views [data-view="list"]').click();
    await page.locator('#editor-items button').filter({hasText:'Automatic · commitment'}).click();
    await expect(page.locator('#editor-meta')).toContainText('suppressed');
    await page.locator('#editor-back').click();
    await page.locator('#editor-items button').filter({hasText:'· budget'}).click();
    await expect(page.locator('#editor-meta')).toContainText('superseded');
    await page.locator('#tab-documents').click();
    await page.locator('#editor-items button').filter({hasText:'plan.md'}).click();
    await expect(page.locator('#editor-preview')).toContainText('Budget: 150');
    await expect(page.locator('#editor-preview')).toContainText('Guests: 10');
    await expect(page.locator('#editor-preview')).toContainText('Keep lift access.');
    expect(app.service.store.events(id).filter(e => e.kind === 'document')).toHaveLength(2);
    expect(phase).toBe(6); expect(errors).toEqual([]);
  } finally {await app.close();}
});

async function fixture(respond, { jev = false, claude = false, claudeModel = 'claude-fixture', countTokens, memoryModel = false, memorySelector } = {}) {
  const store = new Store(undefined, { memory: true });
  const service = new ConclaveService(store, {
    memoryModel,
    ...(memorySelector ? { memorySelector } : {}),
    availability: () => ({ openai: true, anthropic: claude, jev }),
    providerFactory: (provider = "openai") => ({ name: provider, respond, ...(countTokens ? { countTokens } : {}) }),
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
                Claude: { models: claude ? [claudeModel] : [] },
                Gemini: { models: [] },
              }
            : { sign_in: "password", user: null, access: true },
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
test('document removal, shared help, provider counts and Claude effort are usable and persist', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let counted = 0, chosen;
  const app = await fixture(async payload => { chosen = payload.reasoning.effort; return { ...final, model: payload.model }; },
    { claude: true, claudeModel: 'claude-sonnet-5-5', countTokens: async () => { counted++; return { input_tokens: 321 }; } });
  const id = app.service.create('Control proof').conversation_id;
  await app.service.uploadDocument(id, { name: 'notes.md', content: '# Notes\nPreserved original.' });
  const h = app.service.harness(id);
  const old = h.addMessage('assistant', 'Historical background. '.repeat(200)).item;
  for (let n = 0; n < 15; n++) app.service.store.append(id, 'context_skip', 'Historical check ' + n, { revision: 1 });
  app.service.store.append(id, 'decision_proposal', 'bounded attention proposal', {
    revision: app.service.store.context(id).revision, trigger: 'periodic-review', selection_source: 'bounded-model', decision_model: 'jev-fixture',
    entries: [{ bundle_id: old.id, action: 'offload', protected: false, reason: 'Routine background remains retrievable.' }], offload_bundle_ids: [old.id],
  });
  h.offload([old.id]);
  await page.route('**/api/title', route => route.fulfill({ json: { title: 'Control proof' } }));
  try {
    await page.goto(app.url);
    await page.locator('#more-menu > summary').click();
    await page.locator('#docs-open').click();
    await expect(page.locator('#docs-dialog')).toBeVisible();
    await expect(page.locator('#docs-content')).toContainText('Removal is not permanent erasure');
    await page.locator('#docs-close').click();
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Control proof' }).click();
    await page.locator('#workspace-open').click();
    await page.locator('#editor-items button').filter({ hasText: 'notes.md' }).click();
    await page.locator('#editor-remove').click();
    await expect(page.locator('#editor-upload-status')).toContainText('Removed.');
    await expect(page.locator('#editor-items')).not.toContainText('notes.md');
    await page.reload();
    await page.locator('#workspace-open').click();
    await page.locator('#editor-removed summary').click();
    await page.getByRole('button', { name: 'Restore notes.md', exact: true }).click();
    await expect(page.locator('#editor-items')).toContainText('notes.md');
    await page.locator('#tab-context').click();
    await page.locator('#editor-items button').filter({ hasText: 'S2 · reference' }).click();
    await page.locator('#editor-identifiers > summary').click();
    await expect(page.locator('#editor-identifiers-text')).toContainText('canonical:');
    await expect(page.locator('#editor-identifiers-text')).toContainText('Source E2');
    await page.locator('#editor-reference').click();
    await expect(page.locator('#editor-title')).toContainText('S1 · assistant');
    await expect(page.locator('#editor-preview')).toContainText('Historical background.');
    await expect(page.locator('#editor-edit')).toBeHidden();
    await page.locator('#editor-back').click();
    await page.locator('#context-view-activity').click();
    await expect(page.locator('#editor-audit')).toContainText('proposed; not applied');
    await expect(page.locator('#editor-audit')).toContainText('applied · offload');
    await page.locator('#editor-audit-earlier').click();
    await expect(page.locator('#editor-audit-status')).toContainText('Earlier saved activity');
    await expect(page.locator('#editor-audit')).not.toContainText('applied · offload');
    await page.locator('#editor-audit-latest').click();
    await expect(page.locator('#editor-audit')).toContainText('applied · offload');
    await page.locator('#editor-audit-kind').selectOption('workspace');
    await expect(page.locator('#editor-audit')).toContainText('restore');
    await page.locator('#editor-audit-kind').selectOption('context');
    await expect(page.locator('#editor-audit')).toContainText('proposed; not applied');
    await page.locator('#editor-token-count').click();
    await expect(page.locator('#editor-count-status')).toContainText('321 input tokens');
    await expect(page.locator('#editor-token-summary')).toContainText('OpenAI preflight count');
    expect(counted).toBe(1);
    await page.screenshot({ path: testInfo.outputPath('context-control.png'), fullPage: true });
    await page.locator('#editor-close').click();
    await page.locator('#context-panel > summary').click();
    await page.locator('#context-provider').selectOption('anthropic');
    await expect(page.locator('#context-reasoning')).toBeEnabled();
    await page.locator('#context-reasoning').selectOption('high');
    await page.locator('#context-provider').selectOption('openai');
    await expect(page.locator('#context-reasoning')).toHaveValue('low');
    await page.locator('#context-provider').selectOption('anthropic');
    await expect(page.locator('#context-reasoning')).toHaveValue('high');
    await page.locator('#sheet-close').click();
    await page.locator('#workspace-open').click();
    await page.locator('#tab-documents').click();
    await page.locator('#editor-items button').filter({ hasText: 'notes.md' }).click();
    await page.locator('#editor-remove').click();
    await expect(page.locator('#editor-items')).not.toContainText('notes.md');
    await page.locator('#editor-removed summary').click();
    await page.getByRole('button', { name: 'Restore notes.md', exact: true }).click();
    await expect(page.locator('#editor-items')).toContainText('notes.md');
    await page.locator('#tab-context').click();
    await page.locator('#context-view-activity').click();
    await page.locator('#editor-token-count').click();
    await expect(page.locator('#editor-count-status')).toContainText('321 input tokens');
    await page.locator('#editor-close').click();
    await page.locator('#more-menu > summary').click();
    await page.locator('#context-panel > summary').click();
    await expect(page.locator('#context-provider')).toHaveValue('anthropic');
    await expect(page.locator('#context-reasoning')).toHaveValue('high');
    await page.locator('#sheet-close').click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Reply briefly.');
    await page.locator('#send').click();
    await expect(page.locator('#send')).toBeEnabled();
    expect(chosen).toBe('high');
    expect(app.service.view(id).settings.reasoning).toBe('high');
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

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

test('Context image upload previews, sends pixels, reloads, follows up and edits saved images', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let calls = 0;
  const app = await fixture(async payload => {
    calls++;
    const images = payload.input.flatMap(i => Array.isArray(i.content) ? i.content.filter(p => p.type === 'input_image') : []);
    expect(images).toHaveLength(1); expect(images[0].image_url).toMatch(/^data:image\/png;base64,/);
    return final;
  });
  try {
    await page.route('**/api/title', route => route.fulfill({ status: 503, json: { error: 'Naming disabled in fixture' } }));
    await page.goto(app.url);
    await page.getByRole('radio', { name: 'Chat', exact: true }).check();
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 2600; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#114488'; x.fillRect(0,0,2600,1200); x.fillStyle = '#ffcc44'; x.fillRect(500,200,800,600); return c.toDataURL('image/png').split(',')[1]; });
    await page.locator('#markdown-file').setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('#status')).toContainText('Switch to Context or Agent');
    await expect(page.locator('#attachment')).toBeHidden();
    await page.getByRole('radio', { name: 'Context', exact: true }).check();
    await page.locator('#markdown-file').setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('#attachment-preview')).toBeVisible();
    await expect(page.locator('#filename')).toContainText('2048 × 945');
    expect(calls).toBe(0);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Describe the attached diagram.'); await page.locator('#send').click();
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('#chat .image-attachment img')).toHaveCount(1);
    await expect.poll(() => page.locator('#chat .image-attachment img').evaluate(img => img.naturalWidth)).toBe(2048);
    const id = await page.evaluate(() => window.contextLayer.currentId());
    expect(app.service.view(id).attachments[0].data).toBeUndefined(); expect(calls).toBe(1);
    await page.screenshot({ path: testInfo.outputPath('context-image.png'), fullPage: true });
    await page.reload();
    await expect.poll(() => page.locator('#chat .image-attachment img').evaluate(img => img.naturalWidth)).toBe(2048);
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('What color is the smaller rectangle?'); await page.locator('#send').click();
    await expect(page.locator('#send')).toBeEnabled(); expect(calls).toBe(2);
    await page.locator('.edit-message').first().click(); await expect(page.locator('#attachment-preview')).toBeVisible();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Describe the shape instead.'); await page.locator('#send').click();
    await expect(page.locator('#send')).toBeEnabled(); expect(calls).toBe(3);
    await expect(page.locator('#chat .image-attachment img')).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('Agent JPEG upload persists through paused reload and Resume', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); let calls = 0;
  const app = await fixture(async payload => {
    calls++; expect(JSON.stringify(payload)).toContain('data:image/jpeg;base64,'); return final;
  });
  const id = app.service.create('Image Agent').conversation_id;
  try {
    await page.route('**/api/title', route => route.fulfill({ status: 503, json: { error: 'Naming disabled in fixture' } }));
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({ hasText: 'Image Agent' }).click();
    await page.getByRole('radio', { name: 'Agent', exact: true }).check();
    const jpeg = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillRect(0,0,400,300); return c.toDataURL('image/jpeg').split(',')[1]; });
    await page.locator('#markdown-file').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
    await expect(page.locator('#attachment-preview')).toBeVisible();
    // Save the objective through the UI, then pause before the first step.
    let firstStep;
    await page.route('**/api/conclave', async route => {
      const body = route.request().postDataJSON();
      if (body?.action === 'agent_step' && !firstStep) { firstStep = true; return route.fulfill({ status: 503, json: { error: 'Paused fixture step; reload to resume.' } }); }
      return route.continue();
    });
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Inspect this photograph.'); await page.locator('#send').click();
    await expect(page.locator('#status')).toContainText('Paused fixture step'); expect(calls).toBe(0);
    await page.reload();
    await expect(page.locator('#agent-resume')).toBeVisible();
    await expect.poll(() => page.locator('#chat .image-attachment img').evaluate(img => img.naturalWidth)).toBe(400);
    await page.locator('#agent-resume').click();
    await expect(page.locator('#agent-status')).toContainText('completed'); expect(calls).toBe(1);
    await page.screenshot({ path: testInfo.outputPath('agent-image.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

test('Context tab breaks the actual request into parts and compares it with a scoped local baseline', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const app = await fixture(async () => ({ ...final, usage: { input_tokens: 34587, output_tokens: 100 } }));
  const id=app.service.create('Garden comparison').conversation_id;
  const history=app.service.harness(id).addMessage('user','Historical project requirements and decisions. '.repeat(18000));
  const context=app.service.store.context(id);
  app.service.store.commit(id,[segment('Earlier project requirements remain retrievable.',[history.event.id],{type:'summary'})],'compact fixture history',context.revision);
  try {
    await page.goto(app.url);
    if (testInfo.project.name === 'mobile') await page.locator('#menu').click();
    await page.locator('#server-chats .chat-item').filter({hasText:'Garden comparison'}).click();
    await page.getByLabel('Message', { exact: true }).fill('Show a response with complete input accounting.');
    await page.locator('#send').click();
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('#context-stats')).toContainText('cumulative, all calls');
    await expect(page.locator('#context-stats')).toContainText('Latest sent 34,587 input tokens');
    // The top-bar shortcut carries the last request's size and opens the Context tab.
    await expect(page.locator('#context-watch-label')).toHaveText('Context · 34.6K');
    await page.locator('#context-watch').click();
    await expect(page.locator('#tab-context')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#context-garden')).toBeVisible();
    // One bar for the actual last request, split by part; full history is a reference line.
    await expect(page.locator('#garden-request-phase')).toHaveText('Last request');
    await expect(page.locator('#garden-tokens-sent')).toHaveText('34.6K');
    await expect(page.locator('#garden-tokens-sent')).toHaveAttribute('title', /34,587/);
    await expect(page.locator('#garden-comparison-note')).toContainText('reported by the provider');
    await expect(page.locator('#garden-full-tokens')).toHaveText(/^~[\d.,]+K?$/);
    await expect(page.locator('#garden-full-tokens')).toHaveAttribute('title', /Memory reads, memory\/context management, context retrieval and private reasoning are excluded/);
    await expect(page.locator('#garden-request-delta')).toHaveAttribute('data-direction','down');
    await expect(page.locator('#breakdown-baseline')).toContainText('Chat + task-tool baseline:');
    await expect(page.locator('#garden-local-request')).toContainText('current request:');
    await expect(page.locator('#garden-request-delta')).toHaveText(/^\d+% smaller$/);
    await expect(page.locator('.breakdown-part summary .part-name')).toContainText(['Instructions', 'Tool definitions', 'Working context']);
    // Reported usage the local count cannot explain is shown, not folded into the conversation.
    await expect(page.locator('.breakdown-part[data-part="unattributed"]')).toContainText('Not itemized');
    if (testInfo.project.name === 'mobile') {
      const width = await page.locator('#request-breakdown').evaluate(e => ({ actual: e.scrollWidth, available: e.clientWidth }));
      expect(width.actual).toBeLessThanOrEqual(width.available);
    }
    await expect.poll(async()=>page.locator('#breakdown-bar').evaluate(e=>
      [...e.children].reduce((n,c)=>n+c.getBoundingClientRect().width,0)/e.getBoundingClientRect().width)).toBeGreaterThan(0.9);
    // A part opens to its pieces; a piece opens in place with the garden still above it.
    const working = page.locator('.breakdown-part[data-part="context"]');
    await working.locator('summary').click();
    await working.locator('button.breakdown-item').first().click();
    await expect(page.locator('#editor-title')).toHaveText(/^S\d+ · /);
    await expect(page.locator('#context-garden')).toBeVisible();
    await expect(page.locator('#garden-nodes .garden-current')).toHaveCount(1);
    await expect(page.locator('#request-breakdown')).toBeHidden();
    await page.locator('#editor-back').click();
    await expect(page.locator('#request-breakdown')).toBeVisible();
    await expect(working).toHaveAttribute('open', '');
    await page.screenshot({ path: testInfo.outputPath('complete-input-context.png') });
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});

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
    await page.locator('#editor-items button').filter({ hasText: 'Workspace notes.md;' }).click();
    await expect(page.locator('#editor-meta')).toContainText('Partial excerpt: first 2000 characters');
    await expect(page.locator('#editor-preview')).not.toContainText('END OF ORIGINAL');
    await page.locator('#editor-back').click();
    await page.locator('#editor-items button').filter({ hasText: 'Offloaded assistant' }).click();
    await expect(page.locator('#editor-preview')).toContainText('Source excerpt (not a summary)');
    await page.locator('#editor-reference').click();
    await expect(page.locator('#editor-preview')).toContainText('END OF HISTORY');
    await expect(page.locator('#editor-meta')).toContainText('read only');
    await expect(page.locator('#editor-edit')).toBeHidden();
    await page.getByRole('tab', { name: 'Memory', exact: true }).click();
    await page.locator('#memory-views [data-view="list"]').click();
    await page.locator('#editor-items button').filter({ hasText: 'budget' }).click();
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
    const live = page.locator('article[data-provisional="true"] .thoughts');
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute('data-state', 'live');
    await expect(live.locator('.thoughts-steps')).toBeHidden();
    await live.locator('.thoughts-toggle').click();
    await expect(live).toContainText('Check <img');
    expect(await live.locator('img').count()).toBe(0);
    release();
    await expect(page.locator('#send')).toBeEnabled();
    await expect(page.locator('article[data-provisional="true"]')).toHaveCount(0);
    // One trail inside the saved reply holds both model steps.
    const saved = page.locator('article[data-provider] .thoughts');
    await expect(saved).toHaveCount(1);
    await expect(saved.locator('.thoughts-steps details')).toHaveCount(2);
    await expect(saved.locator('.thoughts-label')).toHaveText('Thought · 2 steps');
    await expect(page.locator('article[data-provider] .content')).toHaveText('Verified answer.');
    await expect(saved.locator('.thoughts-steps')).toBeVisible();
    await expect(page.locator('#chat')).not.toContainText('opaque-secret');
    const id = app.service.list()[0].conversation_id;
    expect(app.service.view(id).messages[0].reasoning).toHaveLength(2);
    expect(JSON.stringify(app.service.export(id))).toContain('opaque-secret');
    await page.reload();
    await expect(saved).toHaveCount(1);
    if (await saved.locator('.thoughts-steps').isHidden()) await saved.locator('.thoughts-toggle').click();
    await saved.locator('.thoughts-steps details').last().locator('summary').click();
    await expect(saved.locator('.thoughts-steps details').last()).toContainText('Calculation verified.');
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
    await expect(page.locator('.thoughts')).toHaveCount(1);
    await expect(page.locator('.thoughts-label')).toContainText('partial');
    await page.reload();
    await expect(page.locator('.thoughts')).toHaveCount(1);
    await page.locator('.thoughts-toggle').click();
    await expect(page.locator('.thoughts')).toContainText('Unfinished rationale.');
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
    await page.locator('#editor-items button').first().click();
    await expect(page.locator('#editor-preview')).toContainText('END OF SECTION');
    await page.locator('#editor-back').click();
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
      await page.locator('#editor-items button').first().click();
      await page.screenshot({ path: testInfo.outputPath('issue-10-desktop.png') });
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

for (const mode of ['context', 'agent']) test(`${mode} keeps tool-step narration in the thought trail and discards failed streaming text`, async ({ page }) => {
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
    // Text beside a tool call narrates that step: it leaves the answer and joins the trail.
    await expect(page.locator('article[data-provisional] .content')).not.toContainText('Tool preview');
    await expect(page.locator('article[data-provisional] .thoughts-snippet')).toHaveText('Tool preview');
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
    await expect(page.locator('article[data-provider] .thoughts').first()).toContainText('Tool preview');
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
    await page.locator("#editor-items button").first().click();
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
    await page.getByRole("tab", { name: "Memory", exact: true }).click();
    await page.locator("#editor-new-state").click();
    await page.locator("#editor-state-key").fill("venue");
    await page.locator("#editor-state-type").selectOption("question");
    await page.locator("#editor-state-status").selectOption("unresolved");
    await page.locator("#editor-text").fill("Which venue should we use?");
    await page.locator("#editor-save").click();
    await expect(page.locator("#editor-title")).toHaveText(/^S\d+ · venue$/);
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
    // The piece opens in the Context tab; the garden stays above it.
    await expect(page.locator("#tab-context")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#context-garden")).toBeVisible();
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
test("holding the Claude chip in Context picks its model, switches assistant and refreshes effort and intro", async ({
  page,
}) => {
  const payloads = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const app = await fixture(
    async (payload) => {
      payloads.push(payload);
      return { ...final, model: payload.model };
    },
    { claude: true, claudeModel: "claude-opus-4-6" },
  );
  try {
    await page.goto(app.url);
    await expect(page.locator("#mode-switch")).toBeVisible();
    await expect(page.locator("#empty p")).toContainText("GPT replies");
    await expect(page.locator("#context-reasoning option")).toHaveCount(4);
    await page.locator('#recipients [data-name="Claude"]').click({ delay: 650 });
    await page
      .locator("#model-menu")
      .getByRole("menuitemradio", { name: "claude-opus-4-6" })
      .click();
    await expect(page.locator("#model-menu")).toBeHidden();
    await expect(
      page.locator('#recipients [data-name="Claude"]'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#context-provider")).toHaveValue("anthropic");
    await expect(page.locator("#context-reasoning option")).toHaveText([
      "Default",
      "Low",
      "Medium",
      "High",
      "Max",
    ]);
    await expect(page.locator("#empty p")).toContainText("Claude replies");
    await page.getByLabel("Message", { exact: true }).fill("Use saved context.");
    await page.locator("#send").click();
    await expect(
      page.locator('article.msg[data-provider="claude"]'),
    ).toHaveCount(1);
    expect(payloads[0].model).toBe("claude-opus-4-6");
    expect(errors).toEqual([]);
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

test('provider rejection appears once, inline in the transcript, and survives reload', async ({page}) => {
  const app = await fixture(async () => {throw Error('OpenAI 400: unsupported reasoning fixture');});
  try {
    await openAgent(page, app.url);
    await page.getByLabel('Message', {exact: true}).fill('Write a report.');
    await page.locator('#send').click();
    await expect(page.locator('#chat .turn-error')).toContainText('OpenAI 400: unsupported reasoning fixture');
    // The run notice doesn't repeat a failure the transcript already shows.
    await expect(page.locator('#chat')).not.toContainText(/unsupported reasoning fixture[\s\S]*unsupported reasoning fixture/);
    await page.reload();
    await expect(page.locator('#chat .turn-error')).toContainText('unsupported reasoning fixture');
  } finally {await app.close();}
});

test('completed agents visibly retain blocked optimization errors and their request provenance', async ({ page }) => {
  let calls = 0;
  const app = await fixture(async () => ++calls === 1 ? response([
    call('offload_context', { bundle_ids: ['S1'], expected_revision: 1 }, 1),
  ]) : final);
  try {
    await openAgent(page, app.url);
    await page.getByLabel('Message', { exact: true }).fill('Keep this objective.');
    await page.locator('#send').click();
    await expect(page.locator('#agent-status')).toContainText('completed with tool errors');
    const id = app.service.list()[0].conversation_id;
    const event = app.service.store.events(id).find(e => e.kind === 'tool_result');
    expect(event.metadata.request_id).toBeTruthy();
    expect(event.metadata.previous_revision).toBe(1); expect(event.metadata.revision).toBe(1);
    expect(JSON.parse(event.content).inspection.blocked[0].reasons.map(r => r.code)).toContain('current_request');
    await page.locator('#workspace-open').click();
    await page.locator('#tab-context').click();
    await page.locator('#context-view-activity').click();
    await expect(page.locator('#editor-audit')).toContainText('failed · tool result');
    expect(calls).toBe(2);
  } finally { await app.close(); }
});

test("browser drives real HTTP/service/storage, renders artifacts and resumes after reload", async ({
  page,
}, testInfo) => {
  let calls = 0;
  const app = await fixture(async () => {
    calls++;
    return calls === 1
      ? response([
          call("calculate_expression", { expression: "6 * 7" }, 1),
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
    await page.locator("#more-menu > summary").click();
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
    const exported = await download;
    const record = JSON.parse(await readFile(await exported.path(), "utf8"));
    expect(exported.suggestedFilename()).toBe(exportFilename(record.title, record.exported_at));
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

for (const provider of ['openai', 'anthropic']) test(`${provider}: Stop cancels the active call and discards unfinished text`, async ({
  page,
}) => {
  let release,
    calls = 0, activeSignal, titles = 0;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const app = await fixture(async (_payload, { signal, onDelta }) => {
    calls++;
    activeSignal = signal;
    onDelta('Unfinished answer that must disappear.');
    await new Promise((resolve, reject) => {
      release = resolve;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    return response([
      call("calculate", { operation: "add", values: [1, 2] }, 1),
    ]);
  }, { claude: true });
  await page.route('**/api/title', route => { titles++; return route.fulfill({ json: { title: 'Stop proof' } }); });
  try {
    await openAgent(page, app.url);
    if (provider === 'anthropic') await page.locator('#recipients [data-name="Claude"]').click();
    await page.getByLabel("Message", { exact: true }).fill("Keep calculating.");
    await page.locator("#send").click();
    await expect(page.locator("#agent-stop")).toBeEnabled();
    await expect(page.locator("#run-progress")).toContainText("Model working");
    await expect(page.locator("#context-garden")).toBeHidden();
    await expect(page.locator('article[data-provisional="true"]')).toContainText('Unfinished answer');
    const beforeTitles = titles;
    await page.locator("#agent-stop").click();
    await expect(page.locator("#agent-status")).toContainText("stopped");
    expect(activeSignal.aborted).toBe(true);
    expect(calls).toBe(1);
    expect(titles).toBe(beforeTitles);
    await expect(page.locator('#chat')).not.toContainText('Unfinished answer');
    const id = app.service.list()[0].conversation_id;
    const view = app.service.view(id);
    expect(view.agent.steps).toBe(0);
    expect(view.messages.filter(m => m.role === 'assistant')).toHaveLength(0);
    expect(app.service.store.events(id).filter(e => e.kind === 'tool_call')).toHaveLength(0);
    await expect(page.locator("#send")).toBeEnabled();
    await page.reload();
    await expect(page.locator('#agent-status')).toContainText('stopped');
    await expect(page.locator('#agent-resume')).toBeHidden();
    expect(calls).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    release?.();
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
    await page.locator("#more-menu > summary").click();
    await expect(page.locator("#workspace-panel")).toBeVisible();
  } finally {
    await app.close();
  }
});
