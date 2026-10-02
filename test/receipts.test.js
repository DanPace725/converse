import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, segment, hash } from '../lib/conclave/store.js';
import { activity } from '../lib/conclave/activity.js';

test('transform receipts reference their snapshot instead of copying segments; older receipts still index', () => {
  const store = new Store(undefined, { memory: true });
  try {
    const id = store.create('Receipts');
    const first = segment('First source', [store.append(id, 'user', 'First source', {}, 'human').id]);
    store.commit(id, [first], 'add user', 0);
    const receipt = store.events(id).find((e) => e.kind === 'context_transform');
    assert.equal(receipt.metadata.segments, undefined);
    assert.equal(receipt.metadata.after_hash, hash(store.context(id).segments));
    // Simulate a receipt written before receipts stopped embedding segments.
    const second = segment('Second source', [store.append(id, 'user', 'Second source', {}, 'human').id]);
    const legacy = store.append(id, 'context_transform', 'add user', { revision: 2, previous_revision: 1, segments: [first, second] });
    store.db.prepare('INSERT INTO snapshots VALUES (?,?,?,?)').run(id, 2, JSON.stringify([first, second]), legacy.id);
    const bundles = () => store.db.prepare('SELECT * FROM bundle_index ORDER BY id').all();
    const live = bundles();
    assert.equal(live.length, 2);
    store.reindex();
    assert.deepEqual(bundles(), live);
    assert.equal(store.resolveBundle(id, first.id).content, 'First source');
    const replay = activity(store, id, { replay: true }).events.filter((e) => e.context);
    assert.deepEqual(replay.map((e) => e.context.segments.map((s) => s.preview)), [['First source'], ['First source', 'Second source']]);
  } finally { store.close(); }
});
