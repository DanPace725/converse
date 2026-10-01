import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { conversations, events, snapshots } from "./db-schema.js";
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
      store.db
        .prepare("INSERT INTO snapshots VALUES (?,?,?,?)")
        .run(
          s.conversationId,
          s.revision,
          JSON.stringify(s.segments),
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

  async persist(tx, store, id, lastSeq, revision) {
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
    for (let i = 0; i < projections.length; i += 100)
      await tx.insert(snapshots).values(
        projections.slice(i, i + 100).map((row) => ({
          conversationId: id,
          revision: row.revision,
          receiptId: row.receipt_id,
          segments: row.segments,
        })),
      );
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
          return {
            row,
            events: await tx
              .select()
              .from(events)
              .where(eq(events.conversationId, id))
              .orderBy(asc(events.seq)),
            snapshots: await tx
              .select()
              .from(snapshots)
              .where(eq(snapshots.conversationId, id))
              .orderBy(asc(snapshots.revision)),
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
      hydrate(store, data);
      let { lastSeq, revision } = data.row;
      store.flush = async () => {
        if (!mutation) return;
        const nextSeq = store.events(id).at(-1)?.seq || 0;
        if (nextSeq === lastSeq && store.context(id).revision === revision)
          return;
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
          return this.persist(tx, store, id, lastSeq, revision);
        });
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
