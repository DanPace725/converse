// Tombstones change the active projection, never the canonical append-only log.
export function documentChanges(events) {
  const changes = new Map();
  for (const e of events) if (e.kind === 'document_lifecycle') changes.set(e.metadata.key, e);
  return changes;
}
export function removedSources(events) {
  const changes = documentChanges(events);
  return new Set(events.filter(e => e.kind === 'document' &&
    changes.get(e.metadata.workspace_path ? 'path:' + e.metadata.workspace_path : 'source:' + e.id)?.metadata.operation === 'remove').map(e => e.id));
}
export function sourceRemoved(events, event) {
  const removed = removedSources(events);
  if (removed.has(event.id)) return true;
  if (event.kind !== 'tool_result') return false;
  // Saved file-read copies remain canonical, but models cannot bypass removal.
  try {
    const value = JSON.parse(event.content);
    return JSON.stringify(value).includes('source_event_id') && [...removed].some(id => event.content.includes(id));
  } catch { return false; }
}
