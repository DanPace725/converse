import { hash } from './store.js';
import { validateHandoff } from './handoffs.js';
import { renderClyp, assertClypBudget, documentHash } from './clyps.js';

export const MAX_HANDOFF_BUNDLE_BYTES = 8 * 1024 * 1024;
const fail = message => { throw Object.assign(Error(message), { code: 'invalid_input' }); };
const fields = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)))
    fail('Invalid handoff backup fields');
};
const isoDate = value => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    fail('Use a valid UTC timestamp in the handoff backup');
  return value;
};

// Checksums detect corruption, not who authored a packet. Validate the whole
// bundle before opening a write transaction or accepting any imported claim.
export function validateHandoffBundle(input) {
  if (Buffer.byteLength(JSON.stringify(input) || '') > MAX_HANDOFF_BUNDLE_BYTES) fail('Handoff backup exceeds 8 MiB');
  fields(input, ['format', 'schema_version', 'exported_at', 'source_handoff_id', 'revisions']);
  if (input.format !== 'conclave-handoff' || input.schema_version !== 1) fail('Unsupported handoff backup format');
  if (typeof input.source_handoff_id !== 'string' || !/^conv_[a-zA-Z0-9_-]+$/.test(input.source_handoff_id)) fail('Invalid source handoff ID');
  if (!Array.isArray(input.revisions) || !input.revisions.length || input.revisions.length > 1000) fail('Backup must contain 1–1000 complete revisions');
  const revisions = input.revisions.map((entry, index) => {
    fields(entry, ['revision', 'saved_at', 'sha256', 'packet']);
    if (entry.revision !== index + 1) fail('Backup revisions must be complete, contiguous and oldest first');
    const packet = validateHandoff(entry.packet);
    if (entry.sha256 !== hash(packet)) fail('Backup checksum mismatch; no packets were imported');
    return { revision: entry.revision, saved_at: isoDate(entry.saved_at), sha256: entry.sha256, packet };
  });
  return { format: input.format, schema_version: 1, exported_at: isoDate(input.exported_at),
    source_handoff_id: input.source_handoff_id, revisions };
}

export function exportHandoffBundle(service, handoff_id) {
  return service.store.atomic(() => {
    const first = service.history({ handoff_id, limit: 1 });
    if (first.total > 1000) throw Object.assign(Error('Handoff has more than 1000 revisions; this backup format cannot include it completely'), { code: 'capacity' });
    const revisions = [];
    for (let revision = 1; revision <= first.total; revision++) {
      const saved = service.get({ handoff_id, revision, max_characters: 128000 });
      revisions.push({ revision, saved_at: saved.saved_at, sha256: saved.sha256, packet: saved.packet });
    }
    return validateHandoffBundle({ format: 'conclave-handoff', schema_version: 1, exported_at: new Date().toISOString(),
      source_handoff_id: first.handoff_id, revisions });
  });
}

// Local-only explicit import: new IDs/events, unchanged packet hashes and
// external-data authority. Never restore sessions, tokens, actor or ownership.
export function importHandoffBundle(service, input) {
  const bundle = validateHandoffBundle(input);
  const importId = hash({ source_handoff_id: bundle.source_handoff_id, revisions: bundle.revisions });
  return service.store.atomic(() => {
    for (const row of service.store.list()) {
      const events = service.store.events(row.conversation_id).filter(event => event.kind === 'handoff_packet');
      const previous = events.findLast(event => event.metadata.import_id === importId);
      if (previous) return { ...service.receipt(previous, true), imported_revisions: bundle.revisions.length };
    }
    const handoff_id = service.store.create(bundle.revisions[0].packet.title);
    let previous;
    for (const entry of bundle.revisions) {
      const ormd = entry.packet.clamp ? renderClyp(entry.packet, { handoff_id, revision: entry.revision, previous_event_id: previous?.id || null }) : null;
      if (ormd) assertClypBudget(ormd);
      previous = service.store.append(handoff_id, 'handoff_packet', ormd || JSON.stringify(entry.packet), {
        schema_version: 1, packet: entry.packet, revision: entry.revision, previous_event_id: previous?.id || null,
        ...(ormd ? { format: 'ormd', ormd_sha256: documentHash(ormd) } : {}),
        import_id: importId,
        provenance: { channel: 'external_handoff', authority: 'external_data', author_claims_verified: false,
          imported_from: { handoff_id: bundle.source_handoff_id, revision: entry.revision,
            saved_at: entry.saved_at, sha256: entry.sha256, claims_verified: false } },
      }, 'external');
    }
    return { ...service.receipt(previous, false), imported_revisions: bundle.revisions.length };
  });
}
