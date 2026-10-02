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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const appSchema = pgSchema("app");
export const contextSchema = pgSchema("conclave");
export const conversations = appSchema.table("conversations", {
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
});
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
