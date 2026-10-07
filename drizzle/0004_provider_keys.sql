CREATE TABLE "app"."provider_keys" (
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"secret" text NOT NULL,
	"hint" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_keys_owner_id_provider_pk" PRIMARY KEY("owner_id","provider")
);
