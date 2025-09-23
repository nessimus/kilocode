ALTER TABLE "pool_messages"
  ADD COLUMN IF NOT EXISTS "tokens" integer,
  ADD COLUMN IF NOT EXISTS "item_references" jsonb DEFAULT null;

CREATE TABLE IF NOT EXISTS "pool_digests" (
  "account_id" text NOT NULL,
  "user_id" text NOT NULL,
  "digest" text NOT NULL,
  "token_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_activity_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  PRIMARY KEY ("account_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "pool_digests_updated_idx"
  ON "pool_digests" USING btree ("updated_at" DESC NULLS LAST);
