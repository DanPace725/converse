import test from 'node:test';
import assert from 'node:assert/strict';
import { auditContextExport } from '../scripts/audit-context-export.js';

function fixture() {
  let seq = 0;
  const events = [];
  const add = (kind, content = '', metadata = {}) => events.push({ id: `e${++seq}`, seq, kind, content, metadata, actor: 'human' });
  const answer = (live, frozen, file = 'e2', legacy = false) => add('inference_request', 'answer', { context_revision: live, payload: { input: [
    { content: legacy ? `Working context revision ${frozen}:\n[]` : `Recent context tail:\n[]\nWorking context revision ${frozen}; protected segments: []` },
    { content: `Current saved workspace manifest (authoritative latest versions at revision ${frozen}; workspace tools are available):\n${JSON.stringify(file ? [{ path: 'plan.md', source_event_id: file }] : [])}` },
  ] } });
  return { events, add, answer, audit: () => auditContextExport({ conversation_id: 'audit', context_layer: { events } }) };
}

test('export audit accepts modern and legacy metadata and legitimate frozen file versions', () => {
  for (const legacy of [false, true]) {
    const f = fixture();
    f.add('user'); f.add('document', '', { workspace_path: 'plan.md' }); f.add('context_transform', '', { revision: 1 });
    f.answer(1, 1, 'e2', legacy);
    f.add('document', '', { workspace_path: 'plan.md' }); f.add('context_transform', '', { revision: 2 });
    f.answer(2, 1, 'e2', legacy);
    f.add('context_projection_refresh'); f.answer(2, 2, 'e5', legacy);
    f.add('document_lifecycle', '', { key: 'path:plan.md', operation: 'remove' }); f.add('context_projection_refresh'); f.answer(2, 2, null, legacy);
    f.add('document_lifecycle', '', { key: 'path:plan.md', operation: 'restore' }); f.add('user'); f.answer(2, 2, 'e5', legacy);
    assert.deepEqual(f.audit().mismatches, []);
  }
});

test('export audit still rejects wrong revisions and forged or stale file versions', () => {
  const f = fixture();
  f.add('user'); f.add('document', '', { workspace_path: 'plan.md' }); f.add('context_transform', '', { revision: 1 });
  f.answer(1, 0, 'forged');
  assert.deepEqual(f.audit().mismatches.map(m => m.check), ['revision', 'workspace']);
  const next = fixture();
  next.add('user'); next.add('document', '', { workspace_path: 'plan.md' }); next.add('context_transform', '', { revision: 1 }); next.answer(1, 1);
  next.add('document', '', { workspace_path: 'plan.md' }); next.add('context_transform', '', { revision: 2 }); next.add('user'); next.answer(2, 1);
  assert.deepEqual(next.audit().mismatches.map(m => m.check), ['revision', 'workspace']);
});
