CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "conclave";
--> statement-breakpoint
CREATE TABLE "app"."conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conclave"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "events_conversation_seq" UNIQUE("conversation_id","seq")
);
--> statement-breakpoint
CREATE TABLE "conclave"."snapshots" (
	"conversation_id" text NOT NULL,
	"revision" integer NOT NULL,
	"receipt_id" text NOT NULL,
	"segments" jsonb NOT NULL,
	CONSTRAINT "snapshots_conversation_revision" UNIQUE("conversation_id","revision")
);
--> statement-breakpoint
ALTER TABLE "conclave"."events" ADD CONSTRAINT "events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclave"."snapshots" ADD CONSTRAINT "snapshots_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclave"."snapshots" ADD CONSTRAINT "snapshots_receipt_id_events_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "conclave"."events"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION "conclave"."reject_audit_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Context audit records are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER events_no_change BEFORE UPDATE OR DELETE ON "conclave"."events"
FOR EACH ROW EXECUTE FUNCTION "conclave"."reject_audit_change"();
--> statement-breakpoint
CREATE TRIGGER snapshots_no_change BEFORE UPDATE OR DELETE ON "conclave"."snapshots"
FOR EACH ROW EXECUTE FUNCTION "conclave"."reject_audit_change"();
