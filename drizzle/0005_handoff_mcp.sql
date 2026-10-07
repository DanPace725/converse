CREATE TABLE "app"."handoff_events" (
	"owner_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "handoff_events_owner_id_seq_pk" PRIMARY KEY("owner_id","seq")
);
--> statement-breakpoint
CREATE TABLE "app"."mcp_locks" (
	"key" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."mcp_records" (
	"key" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mcp_records_owner" ON "app"."mcp_records" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "mcp_records_expiry" ON "app"."mcp_records" USING btree ("expires_at");
--> statement-breakpoint
CREATE FUNCTION app.handoff_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'handoff events are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER handoff_events_immutable BEFORE UPDATE OR DELETE ON app.handoff_events
FOR EACH ROW EXECUTE FUNCTION app.handoff_events_immutable();
