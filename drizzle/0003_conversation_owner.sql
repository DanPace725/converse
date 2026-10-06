ALTER TABLE "app"."conversations" ADD COLUMN "owner_id" text;--> statement-breakpoint
CREATE INDEX "conversations_owner" ON "app"."conversations" USING btree ("owner_id","created_at");