import { sql } from 'drizzle-orm';
import { EMBEDDING_MODEL, EMBEDDING_POLICY } from './embeddings.js';

const rows = result => result.rows || result;
const cosine = (a, b) => {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return dot / Math.sqrt(aa * bb);
};

// Rebuildable index, deliberately outside the append-only source/audit tables.
export class SQLiteEmbeddingStore {
  constructor(store) {
    this.db = store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS embeddings (
      conversation_id TEXT NOT NULL, key TEXT NOT NULL, model TEXT NOT NULL,
      policy TEXT NOT NULL, metadata TEXT NOT NULL, embedding TEXT NOT NULL,
      PRIMARY KEY(conversation_id,key,model,policy))`);
  }
  async keys(conversation) {
    return new Set(this.db.prepare('SELECT key FROM embeddings WHERE conversation_id=? AND model=? AND policy=?')
      .all(conversation, EMBEDDING_MODEL, EMBEDDING_POLICY).map(r => r.key));
  }
  async put(conversation, items) {
    const statement = this.db.prepare('INSERT OR IGNORE INTO embeddings VALUES (?,?,?,?,?,?)');
    for (const { content, vector, ...metadata } of items)
      statement.run(conversation, metadata.key, EMBEDDING_MODEL, EMBEDDING_POLICY, JSON.stringify(metadata), JSON.stringify(vector));
  }
  async nearest(conversation, vector, kind, { excluded, memoryIds }, limit = 20) {
    return this.db.prepare('SELECT metadata,embedding FROM embeddings WHERE conversation_id=? AND model=? AND policy=?')
      .all(conversation, EMBEDDING_MODEL, EMBEDDING_POLICY).map(r => ({ ...JSON.parse(r.metadata), vector: JSON.parse(r.embedding) }))
      .filter(r => r.kind === kind && !excluded.has(r.event_id) && (kind !== 'memory' || memoryIds.has(r.entity_id)))
      .map(({ vector: other, ...r }) => ({ ...r, similarity: cosine(vector, other) }))
      .sort((a, b) => b.similarity - a.similarity || a.key.localeCompare(b.key)).slice(0, limit);
  }
  // Pairwise similarity among the given index keys. Reads only.
  async similar(conversation, keys, floor) {
    const items = this.db.prepare(`SELECT metadata,embedding FROM embeddings WHERE conversation_id=? AND model=? AND policy=?
      AND key IN (SELECT value FROM json_each(?)) ORDER BY key`).all(conversation, EMBEDDING_MODEL, EMBEDDING_POLICY, JSON.stringify(keys))
      .map(r => ({ id: JSON.parse(r.metadata).entity_id, vector: JSON.parse(r.embedding) }));
    const pairs = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const similarity = cosine(items[i].vector, items[j].vector);
      if (similarity >= floor) pairs.push({ from: items[i].id, to: items[j].id, similarity });
    }
    return pairs;
  }
}

export class PostgresEmbeddingStore {
  constructor(db) { this.db = db; }
  async keys(conversation) {
    return new Set(rows(await this.db.execute(sql`SELECT key FROM conclave.embeddings
      WHERE conversation_id=${conversation} AND model=${EMBEDDING_MODEL} AND policy=${EMBEDDING_POLICY}`)).map(r => r.key));
  }
  async put(conversation, items) {
    if (!items.length) return;
    const values = items.map(({ content, vector, ...m }) => sql`(${conversation},${m.key},${EMBEDDING_MODEL},
      ${EMBEDDING_POLICY},${m.kind},${m.event_id},${m.entity_id},${JSON.stringify(m)}::jsonb,${JSON.stringify(vector)}::vector)`);
    await this.db.execute(sql`INSERT INTO conclave.embeddings
      (conversation_id,key,model,policy,kind,event_id,entity_id,metadata,embedding)
      VALUES ${sql.join(values, sql`, `)} ON CONFLICT DO NOTHING`);
  }
  async nearest(conversation, vector, kind, { excluded, memoryIds }, limit = 20) {
    if (kind === 'memory' && !memoryIds.size) return [];
    const result = await this.db.execute(sql`SELECT metadata, 1 - (embedding <=> ${JSON.stringify(vector)}::vector) AS similarity
      FROM conclave.embeddings WHERE conversation_id=${conversation} AND model=${EMBEDDING_MODEL}
      AND policy=${EMBEDDING_POLICY} AND kind=${kind}
      AND NOT (event_id = ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify([...excluded])}::jsonb))))
      ${kind === 'memory' ? sql`AND entity_id = ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify([...memoryIds])}::jsonb)))` : sql``}
      ORDER BY embedding <=> ${JSON.stringify(vector)}::vector, key LIMIT ${limit}`);
    return rows(result).map(r => ({ ...r.metadata, similarity: Number(r.similarity) }));
  }
  async similar(conversation, keys, floor) {
    if (keys.length < 2) return [];
    const result = await this.db.execute(sql`WITH current AS (SELECT key, entity_id, embedding FROM conclave.embeddings
      WHERE conversation_id=${conversation} AND model=${EMBEDDING_MODEL} AND policy=${EMBEDDING_POLICY}
      AND key = ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))))
      SELECT a.entity_id AS "from", b.entity_id AS "to", 1 - (a.embedding <=> b.embedding) AS similarity
      FROM current a JOIN current b ON a.key < b.key
      WHERE 1 - (a.embedding <=> b.embedding) >= ${floor} ORDER BY a.key, b.key`);
    return rows(result).map(r => ({ from: r.from, to: r.to, similarity: Number(r.similarity) }));
  }
}
