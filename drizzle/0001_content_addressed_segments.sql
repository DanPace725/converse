CREATE TABLE "conclave"."segments" (
	"conversation_id" text NOT NULL,
	"hash" text NOT NULL,
	"segment" jsonb NOT NULL,
	CONSTRAINT "segments_conversation_id_hash_pk" PRIMARY KEY("conversation_id","hash")
);
--> statement-breakpoint
ALTER TABLE "conclave"."snapshots" ALTER COLUMN "segments" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conclave"."snapshots" ADD COLUMN "segment_hashes" text[];--> statement-breakpoint
ALTER TABLE "conclave"."segments" ADD CONSTRAINT "segments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclave"."snapshots" ADD CONSTRAINT "snapshots_one_form" CHECK (("conclave"."snapshots"."segments" IS NULL) <> ("conclave"."snapshots"."segment_hashes" IS NULL));--> statement-breakpoint
CREATE TRIGGER segments_no_change BEFORE UPDATE OR DELETE ON "conclave"."segments"
FOR EACH ROW EXECUTE FUNCTION "conclave"."reject_audit_change"();
