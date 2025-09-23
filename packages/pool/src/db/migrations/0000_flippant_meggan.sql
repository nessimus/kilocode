CREATE TYPE "public"."pool_item_status" AS ENUM('captured', 'processing', 'ready', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pool_speaker" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "pool_files" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"hash" text NOT NULL,
	"source" text,
	"parsed_text" text,
	"embedding" text DEFAULT null,
	"status" "pool_item_status" DEFAULT 'captured' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"role" "pool_speaker" NOT NULL,
	"content" text NOT NULL,
	"embedding" text DEFAULT null,
	"status" "pool_item_status" DEFAULT 'captured' NOT NULL,
	"message_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pool_files_account_created_idx" ON "pool_files" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pool_files_account_hash_unique" ON "pool_files" USING btree ("account_id","hash");--> statement-breakpoint
CREATE INDEX "pool_messages_account_created_idx" ON "pool_messages" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pool_messages_account_session_idx" ON "pool_messages" USING btree ("account_id","session_id");