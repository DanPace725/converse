import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { conversations, events, segments, snapshots } from "./db-schema.js";
import { Store } from "./conclave/store.js";
import { ConclaveService } from "./conclave/service.js";
import { taskProvider, JevProvider } from "./conclave/provider.js";
import { JevDecisionAdapter } from "./conclave/jev.js";

const fail = (message, status) => {
  throw Object.assign(Error(message), { status });
};
const validId = (id) =>
  typeof id === "string" && /^conv_[a-zA-Z0-9_-]{1,100}$/.test(id);
const snapshotRows = (store, id) =>
  store.db
    .prepare(
      "SELECT revision,receipt_id,segments FROM snapshots WHERE conversation_id=? ORDER BY revision",
    )
    .all(id)
    .map((row) => ({ ...row, segments: JSON.parse(row.segments) }));
// Sorted keys make a segment hash identically before and after a JSONB round trip.
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const segmentHash = (segment) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(segment)))
    .digest("hex");

export function downloadRecord(service, id) {
  const view = service.view(id);
  return {
    schema_version: 1,
    conversation_id: id,
    title: view.title,
    created_at: view.created_at,
    exported_at: new Date().toISOString(),
    participants: [
      { participant_id: "human", display_name: "You" },
      ...Array.from(
        new Map(
          view.messages
            .filter((m) => m.role === "assistant")
            .map((m) => [
              m.participant_id,
              { participant_id: m.participant_id, display_name: m.provider },
            ]),
        ).values(),
      ),
    ],
    messages: view.messages,
    attachments: view.attachments,
    context_layer: service.export(id),
  };
}

// Events and snapshots are append-only (database triggers reject changes), so a
// warm function instance keeps the rows it has already read and fetches only
// newer ones. Without this, every progress poll downloaded the conversation's
// whole audit log, including each stored model request, as Neon egress.
const ROW_CACHE_BYTES = 256 * 1024 * 1024;
const rowCache = new Map();

function cachedRows(id) {
  const entry = rowCache.get(id);
  if (entry) {
    rowCache.delete(id);
    rowCache.set(id, entry);
  }
  return entry;
}

function cacheRows(id, previous, events, snapshots, segmentRows) {
  if (!events.length && !snapshots.length) return previous;
  // Segments are keyed by content hash, so sharing one map between entries is safe.
  const segments = previous?.segments || new Map();
  for (const row of segmentRows) segments.set(row.hash, row.segment);
  const entry = {
    events: previous ? previous.events.concat(events) : events,
    snapshots: previous ? previous.snapshots.concat(snapshots) : snapshots,
    segments,
    seq: events.at(-1)?.seq ?? previous?.seq ?? 0,
    revision: snapshots.at(-1)?.revision ?? previous?.revision ?? 0,
    bytes:
      (previous?.bytes || 0) +
      JSON.stringify(events).length +
      JSON.stringify(snapshots).length +
      JSON.stringify(segmentRows).length,
  };
  // A concurrent request may already have cached a longer prefix.
  const current = rowCache.get(id);
  if (current && current.seq >= entry.seq && current.revision >= entry.revision)
    return entry;
  rowCache.delete(id);
  if (entry.bytes > ROW_CACHE_BYTES) return entry;
  rowCache.set(id, entry);
  let total = 0;
  for (const value of rowCache.values()) total += value.bytes;
  for (const [key, value] of rowCache) {
    if (total <= ROW_CACHE_BYTES || key === id) break;
    rowCache.delete(key);
    total -= value.bytes;
  }
  return entry;
}

// SQLite is a disposable, per-request index. Only PostgreSQL commits are durable.
function hydrate(store, data) {
  store.db.exec("BEGIN");
  try {
    for (const { data: e } of data.events)
      store.db
        .prepare(
          "INSERT INTO events(seq,id,conversation_id,kind,actor,timestamp,content,metadata) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          e.seq,
          e.id,
          e.conversation_id,
          e.kind,
          e.actor,
          e.timestamp,
          e.content,
          JSON.stringify(e.metadata),
        );
    for (const s of data.snapshots)
      store.db.prepare("INSERT INTO snapshots VALUES (?,?,?,?)").run(
        s.conversationId,
        s.revision,
        JSON.stringify(
          s.segments ??
            s.segmentHashes.map((key) => {
              if (!data.segments.has(key))
                throw Error(
                  `Missing context segment for revision ${s.revision}`,
                );
              return data.segments.get(key);
            }),
        ),
        s.receiptId,
      );
    store.db.exec("COMMIT");
    store.refreshIndex();
  } catch (error) {
    store.db.exec("ROLLBACK");
    throw error;
  }
}

export class ContextRepository {
  constructor(db, { serviceOptions = {} } = {}) {
    this.db = db;
    this.serviceOptions = serviceOptions;
  }

  service(store, signal) {
    const deadlineFetch = (url, options = {}) => {
      signal.throwIfAborted();
      return fetch(url, {
        ...options,
        signal: AbortSignal.any([
          signal,
          ...(options.signal ? [options.signal] : []),
        ]),
      });
    };
    return new ConclaveService(store, {
      providerFactory: (provider) =>
        taskProvider(provider, { fetchImpl: deadlineFetch }),
      decisionFactory: () =>
        new JevDecisionAdapter(new JevProvider({ fetchImpl: deadlineFetch })),
      ...this.serviceOptions,
    });
  }

  async list() {
    const rows = await this.db
      .select({
        conversation_id: conversations.id,
        title: conversations.title,
        timestamp: conversations.createdAt,
      })
      .from(conversations)
      .orderBy(desc(conversations.createdAt))
      .limit(200);
    return rows;
  }

  async create(title) {
    const store = new Store(undefined, { memory: true });
    try {
      const service = this.service(store, AbortSignal.timeout(210000));
      const view = service.create(title);
      await this.db.transaction(async (tx) => {
        await tx.insert(conversations).values({
          id: view.conversation_id,
          title: view.title,
          createdAt: view.created_at,
        });
        await this.persist(tx, store, view.conversation_id, 0, 0);
      });
      return view;
    } finally {
      store.close();
    }
  }

  // `stored` lists segment hashes known to be committed; hashes inserted here are
  // pushed to `written` so the caller can add them once the transaction commits.
  async persist(
    tx,
    store,
    id,
    lastSeq,
    revision,
    stored = new Set(),
    written = [],
  ) {
    const additions = store.events(id).filter((event) => event.seq > lastSeq);
    const projections = snapshotRows(store, id).filter(
      (row) => row.revision > revision,
    );
    // Chunk inserts avoid PostgreSQL's parameter limit on large imported audits.
    for (let i = 0; i < additions.length; i += 100)
      await tx.insert(events).values(
        additions.slice(i, i + 100).map((event) => ({
          id: event.id,
          conversationId: id,
          seq: event.seq,
          data: event,
        })),
      );
    const fresh = new Map();
    const rows = projections.map((row) => ({
      conversationId: id,
      revision: row.revision,
      receiptId: row.receipt_id,
      segmentHashes: row.segments.map((item) => {
        const key = segmentHash(item);
        if (!stored.has(key)) fresh.set(key, item);
        return key;
      }),
    }));
    const added = [...fresh];
    for (let i = 0; i < added.length; i += 100)
      await tx
        .insert(segments)
        .values(
          added
            .slice(i, i + 100)
            .map(([hash, segment]) => ({ conversationId: id, hash, segment })),
        )
        .onConflictDoNothing();
    written.push(...fresh.keys());
    for (let i = 0; i < rows.length; i += 100)
      await tx.insert(snapshots).values(rows.slice(i, i + 100));
    const next = {
      title: store.events(id).findLast(event => event.kind === 'conversation_title')?.content
        || store.events(id).find(event => event.kind === 'conversation')?.content,
      lastSeq: additions.at(-1)?.seq ?? lastSeq,
      revision: projections.at(-1)?.revision ?? revision,
    };
    await tx.update(conversations).set(next).where(eq(conversations.id, id));
    return next;
  }

  async run(id, mutation, action) {
    if (!validId(id)) fail("Invalid conversation ID", 400);
    const signal = AbortSignal.timeout(200000);
    const token = randomUUID();
    let leased = false;
    const store = new Store(undefined, { memory: true });
    try {
      if (mutation) {
        const claimed = await this.db
          .update(conversations)
          .set({
            leaseToken: token,
            leaseUntil: sql`now() + interval '270 seconds'`,
          })
          .where(
            and(
              eq(conversations.id, id),
              sql`(${conversations.leaseUntil} IS NULL OR ${conversations.leaseUntil} <= now())`,
            ),
          )
          .returning({ id: conversations.id });
        if (!claimed.length) {
          const found = await this.db
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.id, id));
          fail(
            found.length
              ? "This conversation is answering. Wait before changing it."
              : "Conversation not found",
            found.length ? 409 : 404,
          );
        }
        leased = true;
      }
      const data = await this.db.transaction(
        async (tx) => {
          const [row] = await tx
            .select()
            .from(conversations)
            .where(eq(conversations.id, id));
          if (!row) fail("Conversation not found", 404);
          const cached = cachedRows(id);
          const newEvents = await tx
            .select()
            .from(events)
            .where(
              and(
                eq(events.conversationId, id),
                gt(events.seq, cached?.seq ?? 0),
              ),
            )
            .orderBy(asc(events.seq));
          const newSnapshots = await tx
            .select()
            .from(snapshots)
            .where(
              and(
                eq(snapshots.conversationId, id),
                gt(snapshots.revision, cached?.revision ?? 0),
              ),
            )
            .orderBy(asc(snapshots.revision));
          // Fetch only segments that no cached revision already supplied.
          const missing = [
            ...new Set(newSnapshots.flatMap((s) => s.segmentHashes || [])),
          ].filter((key) => !cached?.segments.has(key));
          const segmentRows = [];
          for (let i = 0; i < missing.length; i += 1000)
            segmentRows.push(
              ...(await tx
                .select({ hash: segments.hash, segment: segments.segment })
                .from(segments)
                .where(
                  and(
                    eq(segments.conversationId, id),
                    inArray(segments.hash, missing.slice(i, i + 1000)),
                  ),
                )),
            );
          const entry = cacheRows(
            id,
            cached,
            newEvents,
            newSnapshots,
            segmentRows,
          );
          return {
            row,
            events: entry?.events || [],
            snapshots: entry?.snapshots || [],
            segments: entry?.segments || new Map(),
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
      hydrate(store, data);
      const stored = new Set(data.segments.keys());
      let { lastSeq, revision } = data.row;
      store.flush = async () => {
        if (!mutation) return;
        const nextSeq = store.events(id).at(-1)?.seq || 0;
        if (nextSeq === lastSeq && store.context(id).revision === revision)
          return;
        const written = [];
        const next = await this.db.transaction(async (tx) => {
          // Fence expired/crashed workers and reject stale projections atomically.
          const claimed = await tx
            .update(conversations)
            .set({ leaseUntil: sql`now() + interval '270 seconds'` })
            .where(
              and(
                eq(conversations.id, id),
                eq(conversations.leaseToken, token),
                eq(conversations.lastSeq, lastSeq),
                eq(conversations.revision, revision),
                sql`${conversations.leaseUntil} > now()`,
              ),
            )
            .returning({ id: conversations.id });
          if (!claimed.length)
            fail(
              "Conversation lease expired or context changed. Reload the chat.",
              409,
            );
          return this.persist(
            tx,
            store,
            id,
            lastSeq,
            revision,
            stored,
            written,
          );
        });
        for (const key of written) stored.add(key);
        ({ lastSeq, revision } = next);
      };
      const service = this.service(store, signal);
      if (
        !mutation &&
        data.row.leaseUntil &&
        Date.parse(data.row.leaseUntil) > Date.now()
      )
        service.busy.add(id);
      try {
        return await action(service);
      } finally {
        await store.flush();
      }
    } finally {
      store.close();
      if (leased)
        await this.db
          .update(conversations)
          .set({ leaseToken: null, leaseUntil: null })
          .where(
            and(eq(conversations.id, id), eq(conversations.leaseToken, token)),
          );
    }
  }
}
