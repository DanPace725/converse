import {
  pgSchema,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

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
    segments: jsonb("segments").notNull(),
  },
  (table) => [
    unique("snapshots_conversation_revision").on(
      table.conversationId,
      table.revision,
    ),
  ],
);
