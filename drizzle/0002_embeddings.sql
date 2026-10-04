CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "conclave"."embeddings" (
	"conversation_id" text NOT NULL,
	"key" text NOT NULL,
	"model" text NOT NULL,
	"policy" text NOT NULL,
	"kind" text NOT NULL,
	"event_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"embedding" vector(1536) NOT NULL,
	CONSTRAINT "embeddings_conversation_id_key_model_policy_pk" PRIMARY KEY("conversation_id","key","model","policy"),
	CONSTRAINT "embeddings_kind" CHECK ("conclave"."embeddings"."kind" IN ('source','memory'))
);
--> statement-breakpoint
ALTER TABLE "conclave"."embeddings" ADD CONSTRAINT "embeddings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclave"."embeddings" ADD CONSTRAINT "embeddings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "conclave"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embeddings_scope" ON "conclave"."embeddings" USING btree ("conversation_id","model","policy","kind");