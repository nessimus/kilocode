CREATE TABLE "pool_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text,
	"company_name" text,
	"title" text,
	"preview" text,
	"last_message_text" text,
	"first_user_message" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_id" text,
	"last_message_role" "pool_speaker",
	"last_message_timestamp" timestamp with time zone,
	"last_message_tokens" integer,
	"last_message_references" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pool_messages" ALTER COLUMN "item_references" SET DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "pool_digests" ALTER COLUMN "token_count" SET DEFAULT 0;--> statement-breakpoint
CREATE INDEX "pool_sessions_account_updated_idx" ON "pool_sessions" USING btree ("account_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);