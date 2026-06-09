CREATE TYPE "exchange_provider" AS ENUM ('binance', 'okx', 'bybit');
CREATE TYPE "connection_status" AS ENUM ('active', 'error', 'disabled');

CREATE TABLE "exchange_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "exchange" "exchange_provider" NOT NULL,
  "label" varchar(80),
  "api_key_enc" text NOT NULL,
  "api_secret_enc" text NOT NULL,
  "read_only" boolean DEFAULT true NOT NULL,
  "status" "connection_status" DEFAULT 'active' NOT NULL,
  "last_sync_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "exchange_connections_user_idx" ON "exchange_connections" ("user_id");

ALTER TABLE "crypto_transactions" ADD COLUMN "source" varchar(20) DEFAULT 'manual' NOT NULL;
ALTER TABLE "crypto_transactions" ADD COLUMN "external_trade_id" varchar(64);
CREATE UNIQUE INDEX "crypto_tx_external_idx"
  ON "crypto_transactions" ("user_id", "source", "external_trade_id")
  WHERE "external_trade_id" IS NOT NULL;
