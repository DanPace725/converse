import { Store } from './store.js';
import { HandoffService, validateHandoff } from './handoffs.js';
import { referenceSequence } from './handoff-references.js';

// A row lock serializes writes across server instances. All queries are bound
// to a verified owner; local/password sessions must never enter this adapter.
export async function transaction(pool, key, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO app.mcp_locks(key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
    await client.query('SELECT key FROM app.mcp_locks WHERE key=$1 FOR UPDATE', [key]);
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export class HandoffRepository {
  constructor(pool, owner) {
    if (typeof owner !== 'string' || !owner.trim()) throw Error('A verified owner is required');
    this.pool = pool; this.owner = owner;
  }
  async run(method, input) {
    const execute = async client => {
      // A read of one packet by ID needs only that packet's events. Discovery,
      // title lookup and saves still rebuild the account's bounded history.
      const sequence = referenceSequence(input?.handoff_id);
      const read = method !== 'save' && method !== 'find';
      const one = read && typeof input?.handoff_id === 'string' && /^conv_[a-zA-Z0-9_-]+$/.test(input.handoff_id);
      const { rows } = read && sequence !== null
        ? await client.query("SELECT data FROM app.handoff_events WHERE owner_id=$1 AND data->>'conversation_id'=(SELECT data->>'conversation_id' FROM app.handoff_events WHERE owner_id=$1 AND seq=$2 AND data->>'kind'='handoff_packet') ORDER BY seq", [this.owner, sequence])
        : one
        ? await client.query("SELECT data FROM app.handoff_events WHERE owner_id=$1 AND data->>'conversation_id'=$2 ORDER BY seq", [this.owner, input.handoff_id])
        : await client.query('SELECT data FROM app.handoff_events WHERE owner_id=$1 ORDER BY seq LIMIT 2001', [this.owner]);
      // Explicit pilot limit, rather than silently omitting older packets.
      if (rows.length > 2000)
        throw Object.assign(Error('Handoff storage pilot limit reached; contact the administrator'), { code: 'capacity' });
      const store = new Store(null, { memory: true });
      try {
        const insert = store.db.prepare('INSERT INTO events(seq,id,conversation_id,kind,actor,timestamp,content,metadata) VALUES (?,?,?,?,?,?,?,?)');
        for (const { data: e } of rows) {
          // JSONB reorders object keys. Restore the canonical packet field order
          // before hashing so a PostgreSQL round trip preserves the receipt.
          if (e.kind === 'handoff_packet') e.metadata.packet = validateHandoff(e.metadata.packet);
          insert.run(e.seq, e.id, e.conversation_id, e.kind, e.actor, e.timestamp, e.content, JSON.stringify(e.metadata));
        }
        const service = new HandoffService(store);
        const result = service[method](input);
        if (method === 'save') {
          const newest = rows.at(-1)?.data.seq || 0;
          const added = store.db.prepare('SELECT * FROM events WHERE seq>? ORDER BY seq').all(newest);
          if (rows.length + added.length > 2000)
            throw Object.assign(Error('Handoff storage pilot limit reached; contact the administrator'), { code: 'capacity' });
          for (const e of added) {
            e.metadata = JSON.parse(e.metadata);
            await client.query('INSERT INTO app.handoff_events(owner_id,seq,data) VALUES ($1,$2,$3)', [this.owner, e.seq, e]);
          }
        }
        return result;
      } finally { store.close(); }
    };
    return method === 'save' ? transaction(this.pool, `handoffs:${this.owner}`, execute) : execute(this.pool);
  }
  save(input) { return this.run('save', input); }
  find(input) { return this.run('find', input); }
  get(input) { return this.run('get', input); }
  history(input) { return this.run('history', input); }
  compare(input) { return this.run('compare', input); }
  graph(input) { return this.run('graph', input); }
}

// OAuth state is durable too: a fresh server instance can redeem a code or
// refresh a connection. Tokens/codes are indexed only by their SHA-256 digest.
export class McpRecordStore {
  constructor(pool) { this.pool = pool; }
  async get(key, client = this.pool) {
    const { rows } = await client.query('SELECT data FROM app.mcp_records WHERE key=$1 AND expires_at>now()', [key]);
    return rows[0]?.data;
  }
  async put(key, data, expires, owner = null, client = this.pool) {
    await client.query('INSERT INTO app.mcp_records(key,owner_id,data,expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at,owner_id=excluded.owner_id', [key, owner, data, new Date(expires).toISOString()]);
  }
  async remove(key, client = this.pool) { await client.query('DELETE FROM app.mcp_records WHERE key=$1', [key]); }
  async list(owner) {
    const { rows } = await this.pool.query("SELECT key,data FROM app.mcp_records WHERE owner_id=$1 AND key LIKE 'grant:%' AND expires_at>now() ORDER BY key", [owner]);
    return rows;
  }
  atomic(key, action) { return transaction(this.pool, `oauth:${key}`, client => action(client)); }
}
