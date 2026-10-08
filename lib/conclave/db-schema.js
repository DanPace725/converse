import {
  pgSchema,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  unique,
  primaryKey,
  check,
  vector,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const appSchema = pgSchema("app");
export const contextSchema = pgSchema("conclave");
export const conversations = appSchema.table(
  "conversations",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    revision: integer("revision").notNull().default(0),
    lastSeq: bigint("last_seq", { mode: "number" }).notNull().default(0),
    leaseToken: text("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "string" }),
    // The signed-in user who created the conversation. Null rows predate
    // sign-in or come from password access; no signed-in user can reach them.
    ownerId: text("owner_id"),
  },
  (table) => [index("conversations_owner").on(table.ownerId, table.createdAt)],
);
export const events = contextSchema.table(
  "events",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    seq: bigint("seq", { mode: "number" }).notNull(),
    data: jsonb("data").notNull(),
  },
  (table) => [
    unique("events_conversation_seq").on(table.conversationId, table.seq),
  ],
);
export const snapshots = contextSchema.table(
  "snapshots",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    revision: integer("revision").notNull(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => events.id),
    // Rows written before content-addressed storage hold full segments; newer
    // rows list segment hashes in order, resolved through the segments table.
    segments: jsonb("segments"),
    segmentHashes: text("segment_hashes").array(),
  },
  (table) => [
    unique("snapshots_conversation_revision").on(
      table.conversationId,
      table.revision,
    ),
    check(
      "snapshots_one_form",
      sql`(${table.segments} IS NULL) <> (${table.segmentHashes} IS NULL)`,
    ),
  ],
);
// Each distinct context segment is stored once per conversation, keyed by the
// SHA-256 of its canonical JSON. Snapshots repeat most segments between revisions.
export const segments = contextSchema.table(
  "segments",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    hash: text("hash").notNull(),
    segment: jsonb("segment").notNull(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.hash] })],
);

export const embeddings = contextSchema.table('embeddings', {
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  key: text('key').notNull(), model: text('model').notNull(), policy: text('policy').notNull(),
  kind: text('kind').notNull(), eventId: text('event_id').notNull().references(() => events.id),
  entityId: text('entity_id').notNull(), metadata: jsonb('metadata').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
}, table => [primaryKey({ columns: [table.conversationId, table.key, table.model, table.policy] }),
  index('embeddings_scope').on(table.conversationId, table.model, table.policy, table.kind),
  check('embeddings_kind', sql`${table.kind} IN ('source','memory')`)]);

// One provider API key per signed-in user and provider, stored encrypted; see
// credentials.js. `hint` is the key's last four characters, for display.
export const providerKeys = appSchema.table('provider_keys', {
  ownerId: text('owner_id').notNull(),
  provider: text('provider').notNull(),
  secret: text('secret').notNull(),
  hint: text('hint').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.ownerId, table.provider] })]);

export const mcpLocks = appSchema.table('mcp_locks', { key: text('key').primaryKey() });
export const mcpRecords = appSchema.table('mcp_records', {
  key: text('key').primaryKey(), ownerId: text('owner_id'), data: jsonb('data').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
}, table => [index('mcp_records_owner').on(table.ownerId), index('mcp_records_expiry').on(table.expiresAt)]);
export const handoffEvents = appSchema.table('handoff_events', {
  ownerId: text('owner_id').notNull(), seq: bigint('seq', { mode: 'number' }).notNull(), data: jsonb('data').notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.seq] })]);
