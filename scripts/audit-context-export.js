import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sourceIdentityIndex } from '../lib/conclave/identity.js';

// Context and workspace projections stay frozen across ordinary tool steps.
// Their revision is distinct from the live revision recorded on a request.
export function auditContextExport(data) {
  const events = data.context_layer.events;
  const files = new Map(), removed = new Set(), mismatches = [];
  const ordered = entries => [...entries].sort(([a], [b]) => a.localeCompare(b));
  const activeFiles = () => ordered([...files].filter(([path]) => !removed.has('path:' + path)));
  let revision = 0, answerRequests = 0, frozen = null;
  for (const event of events) {
    if (event.kind === 'context_transform') revision = event.metadata.revision;
    if (event.kind === 'document' && event.metadata.workspace_path)
      files.set(event.metadata.workspace_path, event.id);
    if (event.kind === 'document_lifecycle') {
      if (event.metadata.operation === 'remove') removed.add(event.metadata.key);
      else if (event.metadata.operation === 'restore') removed.delete(event.metadata.key);
    }
    if (event.kind === 'user' || event.kind === 'context_projection_refresh') frozen = null;
    if (event.kind !== 'inference_request' || event.content !== 'answer') continue;
    answerRequests++;
    const input = event.metadata.payload.input;
    const text = input.filter(i => typeof i.content === 'string').map(i => i.content);
    const working = text.map(s => s.match(/(?:^|\n)Working context revision (\d+)[:;]/)?.[1]).find(Boolean);
    const manifest = text.find(s => s.startsWith('Current saved workspace manifest '));
    const manifestRevision = manifest?.match(/at revision (\d+)/)?.[1];
    const displayed = Number(working ?? manifestRevision);
    // Older unfrozen exports call this the latest manifest and have no saved
    // manifest revision. Their expected file set remains live on every call.
    if (manifestRevision === undefined && !/working projection is frozen/i.test(event.metadata.payload.instructions || '')) frozen = null;
    frozen ??= { revision, files: activeFiles() };
    if (displayed !== frozen.revision || manifestRevision !== undefined && Number(manifestRevision) !== frozen.revision
      || event.metadata.context_revision !== revision)
      mismatches.push({ seq: event.seq, check: 'revision', expected: frozen.revision, live: revision,
        displayed, manifest_revision: manifestRevision === undefined ? null : Number(manifestRevision), recorded: event.metadata.context_revision });
    const actual = manifest ? JSON.parse(manifest.split('\n')[1]) : [];
    const observed = ordered(actual.map(f => [f.path, f.source_event_id]));
    if (JSON.stringify(frozen.files) !== JSON.stringify(observed))
      mismatches.push({ seq: event.seq, check: 'workspace', expected: frozen.files, observed });
  }
  const identities = sourceIdentityIndex(events);
  return { conversation_id: data.conversation_id, events: events.length, answer_requests: answerRequests,
    mismatches, latest_documents: [...files].map(([path, id]) => ({ path, ...identities.get(id) })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = auditContextExport(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log(JSON.stringify(result, null, 2));
  if (result.mismatches.length) process.exitCode = 1;
}
