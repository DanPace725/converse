import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateState, checkAttribution } from './state.js';

export const id = (prefix) => `${prefix}_${randomUUID()}`;
export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const decode = (row) => row && { ...row, metadata: JSON.parse(row.metadata) };

export class Store {
  constructor(directory = '.conclave', { memory = false } = {}) {
    this.memoryOnly = memory;
    this.directory = memory ? null : resolve(directory);
    if (!memory) mkdirSync(this.directory, { recursive: true });
    this.db = new DatabaseSync(memory ? ':memory:' : join(this.directory, 'conclave.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        conversation_id TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL,
        timestamp TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_conversation ON events(conversation_id, seq);
      CREATE TABLE IF NOT EXISTS source_chunks (
        event_id TEXT NOT NULL, conversation_id TEXT NOT NULL, offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL, content TEXT NOT NULL,
        PRIMARY KEY(event_id, offset)
      );
      CREATE INDEX IF NOT EXISTS chunks_conversation ON source_chunks(conversation_id);
      CREATE TABLE IF NOT EXISTS bundle_index (
        conversation_id TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, segment TEXT NOT NULL,
        PRIMARY KEY(conversation_id, id)
      );
      CREATE TABLE IF NOT EXISTS context_index_state (singleton INTEGER PRIMARY KEY, last_seq INTEGER NOT NULL);
      INSERT OR IGNORE INTO context_index_state VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS snapshots (
        conversation_id TEXT NOT NULL, revision INTEGER NOT NULL,
        segments TEXT NOT NULL, receipt_id TEXT NOT NULL,
        PRIMARY KEY(conversation_id, revision)
      );
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
        BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS snapshots_no_update BEFORE UPDATE ON snapshots
        BEGIN SELECT RAISE(ABORT, 'snapshots are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS snapshots_no_delete BEFORE DELETE ON snapshots
        BEGIN SELECT RAISE(ABORT, 'snapshots are append-only'); END;
    `);
    try {
      this.db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS history_search USING fts5(event_id UNINDEXED, conversation_id UNINDEXED, content)');
      this.fts = true;
    } catch (error) {
      if (!error.message.includes('no such module: fts5')) throw error;
      this.fts = false;
    }
    this.refreshIndex();
  }

  append(conversation, kind, content, metadata = {}, actor = 'system') {
    const event = { id: id('evt'), conversation_id: conversation, kind, actor,
      timestamp: new Date().toISOString(), content, metadata };
    const result = this.db.prepare('INSERT INTO events(id,conversation_id,kind,actor,timestamp,content,metadata) VALUES (?,?,?,?,?,?,?)')
      .run(event.id, conversation, kind, actor, event.timestamp, content, JSON.stringify(metadata));
    event.seq = Number(result.lastInsertRowid);
    this.refreshIndex();
    return event;
  }

  create(title = 'Untitled') {
    const conversation = id('conv');
    this.append(conversation, 'conversation', title);
    return conversation;
  }

  requireConversation(conversation) {
    if (!this.db.prepare("SELECT 1 FROM events WHERE conversation_id=? AND kind='conversation'").get(conversation)) {
      throw Error(`Unknown conversation: ${conversation}`);
    }
  }

  list() {
    return this.db.prepare(`SELECT e.conversation_id, COALESCE((SELECT t.content FROM events t
      WHERE t.conversation_id=e.conversation_id AND t.kind='conversation_title' ORDER BY t.seq DESC LIMIT 1), e.content) AS title,
      e.timestamp FROM events e WHERE e.kind='conversation' ORDER BY e.seq DESC`).all();
  }

  events(conversation) {
    return this.db.prepare('SELECT * FROM events WHERE conversation_id=? ORDER BY seq').all(conversation).map(decode);
  }

  event(conversation, eventId) {
    const row = decode(this.db.prepare('SELECT * FROM events WHERE conversation_id=? AND id=?').get(conversation, eventId));
    if (!row) throw Error(`Unknown source event: ${eventId}`);
    return row;
  }

  source(conversation, eventId) {
    const event = this.event(conversation, eventId);
    if (!['user', 'assistant', 'document', 'reasoning'].includes(event.kind)) throw Error('Source must be a message, document or reasoning summary');
    return event;
  }

  search(conversation, query, limit = 5) {
    const terms = String(query).match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 12) || [];
    if (!terms.length) return [];
    let rows;
    if (this.fts) {
      rows = this.db.prepare(`SELECT e.* FROM history_search h JOIN events e ON e.id=h.event_id
        WHERE history_search MATCH ? AND h.conversation_id=? ORDER BY bm25(history_search),e.seq DESC LIMIT ?`)
        .all(terms.map((t) => `"${t}"`).join(' OR '), conversation, limit);
    } else {
      rows = this.db.prepare(`SELECT * FROM events WHERE conversation_id=? AND kind IN ('user','assistant','document','reasoning')
        AND (${terms.map(() => "instr(lower(content),lower(?))>0").join(' OR ')}) ORDER BY seq DESC LIMIT ?`)
        .all(conversation, ...terms, limit);
    }
    return rows.map(decode);
  }

  refreshIndex() {
    const ownsTransaction = !this.inTransaction;
    if (ownsTransaction) this.db.exec('BEGIN IMMEDIATE');
    try {
    const checkpoint = this.db.prepare('SELECT last_seq FROM context_index_state WHERE singleton=1').get().last_seq;
    for (const event of this.db.prepare('SELECT * FROM events WHERE seq>? ORDER BY seq').all(checkpoint).map(decode)) {
      if (['user', 'assistant', 'document', 'reasoning'].includes(event.kind)) {
        this.db.prepare('DELETE FROM source_chunks WHERE event_id=?').run(event.id);
        // Overlap keeps a short phrase searchable across a chunk boundary. Offsets are JS characters, like retrieval.
        for (let offset = 0; offset < event.content.length; offset += 1440) {
          const content = event.content.slice(offset, offset + 1600);
          this.db.prepare('INSERT INTO source_chunks VALUES (?,?,?,?,?)')
            .run(event.id, event.conversation_id, offset, offset + content.length, content);
          if (offset + content.length === event.content.length) break;
        }
        if (this.fts) {
          this.db.prepare('DELETE FROM history_search WHERE event_id=?').run(event.id);
          this.db.prepare('INSERT INTO history_search VALUES (?,?,?)').run(event.id, event.conversation_id, event.content);
        }
      }
      if (event.kind === 'context_transform') {
        for (const item of event.metadata.segments || []) {
          this.db.prepare('INSERT INTO bundle_index VALUES (?,?,?,?) ON CONFLICT(conversation_id,id) DO UPDATE SET revision=excluded.revision,segment=excluded.segment WHERE excluded.revision>=bundle_index.revision')
            .run(event.conversation_id, item.id, event.metadata.revision, JSON.stringify(item));
        }
      }
      this.db.prepare('UPDATE context_index_state SET last_seq=max(last_seq,?) WHERE singleton=1').run(event.seq);
    }
      if (ownsTransaction) this.db.exec('COMMIT');
    } catch (error) { if (ownsTransaction) this.db.exec('ROLLBACK'); throw error; }
  }

  reindex() {
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      this.db.exec('DELETE FROM source_chunks; DELETE FROM bundle_index; UPDATE context_index_state SET last_seq=0;');
      if (this.fts) this.db.exec('DELETE FROM history_search');
      this.refreshIndex();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.inTransaction = false; }
  }

  searchChunks(conversation, query, limit = 4, eventId = null) {
    const terms = [...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [])].slice(0, 12);
    if (!terms.length) return [];
    const conditions = terms.map(() => 'instr(lower(c.content),?)>0').join(' OR ');
    const score = terms.map(() => '(instr(lower(c.content),?)>0)').join('+');
    return this.db.prepare(`WITH matches AS (
      SELECT c.*,e.seq,e.kind,(${score}) AS matches FROM source_chunks c JOIN events e ON e.id=c.event_id
      WHERE c.conversation_id=? ${eventId ? 'AND c.event_id=?' : ''} AND (${conditions})
    ), ranked AS (SELECT *,row_number() OVER (PARTITION BY event_id ORDER BY matches DESC,offset) AS rank FROM matches)
    SELECT * FROM ranked WHERE rank=1 ORDER BY matches DESC,seq DESC LIMIT ?`)
      .all(...terms, conversation, ...(eventId ? [eventId] : []), ...terms, limit);
  }

  memory(conversation, query = '', limit = 50) {
    const current = this.context(conversation);
    const active = new Set(current.segments.map((s) => s.id));
    const references = new Set(current.segments.map((s) => s.ref_bundle_id).filter(Boolean));
    const superseded = new Set(), pending = current.segments.flatMap((s) => s.relations?.supersedes || []);
    while (pending.length) {
      const bundleId = pending.pop();
      if (superseded.has(bundleId)) continue;
      superseded.add(bundleId);
      pending.push(...(this.resolveBundle(conversation, bundleId).relations?.supersedes || []));
    }
    const terms = String(query).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
    return this.db.prepare('SELECT * FROM bundle_index WHERE conversation_id=? ORDER BY revision DESC,id').all(conversation)
      .map((row) => {
        const item = JSON.parse(row.segment);
        return { ...item, last_revision: row.revision,
          proximity: active.has(item.id) ? item.type === 'reference' ? 'proximal' : 'active'
            : references.has(item.id) ? 'proximal' : item.status === 'superseded' || superseded.has(item.id) ? 'archived' : 'indexed',
          frame: `conversation.${item.type}`, refs: item.source_event_ids.map((eventId) => `trajectory://${conversation}/${eventId}`) };
      }).filter((s) => !terms.length || terms.some((t) => s.content.toLowerCase().includes(t))).slice(0, limit);
  }

  snapshot(conversation, revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw Error('Revision must be a nonnegative integer');
    if (revision === 0) return { revision: 0, segments: [], receipt_id: null };
    const row = this.db.prepare('SELECT * FROM snapshots WHERE conversation_id=? AND revision=?').get(conversation, revision);
    if (!row) throw Error(`Unknown context revision: ${revision}`);
    return { revision: row.revision, segments: JSON.parse(row.segments), receipt_id: row.receipt_id };
  }

  restore(conversation, revision) {
    const old = this.snapshot(conversation, revision), current = this.context(conversation);
    // Later pins remain authoritative even when restoring an earlier projection.
    const protectedItems = current.segments.filter((s) => s.pinned || s.verbatim_required);
    const protectedIds = new Set(protectedItems.map((s) => s.id));
    const protectedKeys = new Set(protectedItems.map((s) => s.state_key).filter(Boolean));
    const next = old.segments.filter((s) => !protectedIds.has(s.id) && !protectedKeys.has(s.state_key)).concat(protectedItems);
    return this.commit(conversation, next, 'restore context revision', current.revision, [], {
      restored_from_revision: revision, restored_from_receipt: old.receipt_id, preserved_pin_ids: [...protectedIds],
    });
  }

  context(conversation) {
    const row = this.db.prepare('SELECT * FROM snapshots WHERE conversation_id=? ORDER BY revision DESC LIMIT 1').get(conversation);
    return row ? { revision: row.revision, segments: JSON.parse(row.segments), receipt_id: row.receipt_id }
      : { revision: 0, segments: [], receipt_id: null };
  }

  resolveBundle(conversation, bundleId) {
    const indexed = this.db.prepare('SELECT segment FROM bundle_index WHERE conversation_id=? AND id=?').get(conversation, bundleId);
    if (indexed) return JSON.parse(indexed.segment);
    for (const row of this.db.prepare('SELECT segments FROM snapshots WHERE conversation_id=? ORDER BY revision DESC').all(conversation)) {
      const segment = JSON.parse(row.segments).find((s) => s.id === bundleId);
      if (segment) return segment;
    }
    throw Error(`Unknown bundle: ${bundleId}`);
  }

  diff(conversation) {
    const rows = this.db.prepare('SELECT revision,segments FROM snapshots WHERE conversation_id=? ORDER BY revision DESC LIMIT 2').all(conversation);
    const after = JSON.parse(rows[0]?.segments || '[]');
    const before = JSON.parse(rows[1]?.segments || '[]');
    return { from_revision: rows[1]?.revision || 0, to_revision: rows[0]?.revision || 0,
      removed: before.filter((s) => !after.some((n) => n.id === s.id)),
      added: after.filter((s) => !before.some((n) => n.id === s.id)),
      changed: after.filter((s) => before.some((n) => n.id === s.id && hash(n) !== hash(s))) };
  }

  commit(conversation, segments, reason, expectedRevision, protectedIds = [], details = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    let revision;
    try {
      const previous = this.context(conversation);
      if (previous.revision !== expectedRevision) throw Error('Stale context revision; reload context');
      const seen = new Set();
      const stateKeys = new Set();
      for (const segment of segments) {
        if (seen.has(segment.id)) throw Error('Duplicate bundle ID');
        seen.add(segment.id);
        if (typeof segment.id !== 'string' || typeof segment.content !== 'string' || !segment.content.trim()
          || !Array.isArray(segment.source_event_ids) || !segment.source_event_ids.length
          || !Array.isArray(segment.parent_bundle_ids) || typeof segment.pinned !== 'boolean'
          || typeof segment.verbatim_required !== 'boolean'
          || !['active', 'unresolved', 'superseded'].includes(segment.status)) throw Error('Invalid context segment');
        for (const eventId of segment.source_event_ids) this.source(conversation, eventId);
        for (const parentId of segment.parent_bundle_ids) this.resolveBundle(conversation, parentId);
        if (segment.state_key !== undefined) {
          validateState(segment);
          checkAttribution(this, conversation, segment);
          if (stateKeys.has(segment.state_key)) throw Error('Duplicate active state key');
          stateKeys.add(segment.state_key);
          for (const ref of Object.values(segment.relations).flat()) this.resolveBundle(conversation, ref);
        }
        if (segment.type === 'reference') {
          if (typeof segment.ref_bundle_id !== 'string' || !segment.parent_bundle_ids.includes(segment.ref_bundle_id)) throw Error('Reference must identify its parent bundle');
          const original = this.resolveBundle(conversation, segment.ref_bundle_id);
          if (hash([...original.source_event_ids].sort()) !== hash([...segment.source_event_ids].sort())) throw Error('Reference source coverage changed');
        }
        if (segment.content_hash !== hash(segment.content)) throw Error('Content hash mismatch');
      }
      for (const segment of previous.segments) {
        if (segment.pinned || segment.verbatim_required || protectedIds.includes(segment.id)
          || (segment.state_key && !['update structured task state', 'restore context revision'].includes(reason))) {
          const next = segments.find((s) => s.id === segment.id);
          if (!next || hash(next) !== hash(segment)) throw Error(`Protected segment cannot be changed: ${segment.id}`);
        }
      }
      revision = previous.revision + 1;
      const receipt = this.append(conversation, 'context_transform', reason, {
        ...details, revision, previous_revision: previous.revision,
        before_hash: hash(previous.segments), after_hash: hash(segments),
        source_event_ids: [...new Set(segments.flatMap((s) => s.source_event_ids))], segments,
      });
      this.db.prepare('INSERT INTO snapshots VALUES (?,?,?,?)').run(conversation, revision, JSON.stringify(segments), receipt.id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally { this.inTransaction = false; }
    // This file is a disposable view; SQLite is authoritative after a restart.
    try { this.writeView(conversation); } catch { /* A view failure must not undo a committed snapshot. */ }
    return this.context(conversation);
  }

  writeView(conversation) {
    this.requireConversation(conversation);
    const context = this.context(conversation);
    const text = `# Live context — revision ${context.revision}\n\n` + context.segments.map((s) =>
      `## ${s.type} [${s.id}]${s.pinned ? ' PINNED' : ''} (${s.status})${s.state_key ? `\nState key: ${s.state_key}; resolution: ${s.resolution.status}; confidence: unknown` : ''}\nSources: ${s.source_event_ids.join(', ')}\n\n${s.content}\n`).join('\n');
    if (this.memoryOnly) return text;
    const folder = join(this.directory, conversation);
    mkdirSync(folder, { recursive: true });
    const temporary = join(folder, 'context.md.tmp');
    writeFileSync(temporary, text);
    renameSync(temporary, join(folder, 'context.md'));
    return text;
  }

  close() { this.db.close(); }
}

export function segment(content, sourceIds, options = {}) {
  return { id: id('cb'), type: 'recent', status: 'active', pinned: false, verbatim_required: false,
    parent_bundle_ids: [], ...options, content, source_event_ids: [...new Set(sourceIds)], content_hash: hash(content) };
}
