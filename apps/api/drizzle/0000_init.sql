-- FinFolio MVP — initial schema (matches src/db/schema)
-- Hand-authored to mirror the SRS §6 design. Re-generate with `pnpm db:generate`
-- once you start evolving the schema.

CREATE TYPE "currency" AS ENUM ('VND', 'USD');
CREATE TYPE "asset_type" AS ENUM ('gold', 'stock', 'crypto');
CREATE TYPE "gold_action" AS ENUM ('buy', 'sell');
CREATE TYPE "gold_unit" AS ENUM ('chi', 'luong', 'cay');
CREATE TYPE "stock_action" AS ENUM ('buy', 'sell', 'cash_dividend', 'stock_dividend');
CREATE TYPE "exchange" AS ENUM ('HOSE', 'HNX', 'UPCOM');
CREATE TYPE "crypto_action" AS ENUM ('buy', 'sell', 'swap');
CREATE TYPE "dividend_type" AS ENUM ('cash', 'stock');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "display_name" varchar(120),
  "currency" "currency" DEFAULT 'VND' NOT NULL,
  "timezone" varchar(64) DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "users_email_idx" ON "users" ("email");

CREATE TABLE "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" ("user_id");
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens" ("token_hash");

CREATE TABLE "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "password_reset_tokens_hash_idx" ON "password_reset_tokens" ("token_hash");
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" ("user_id");

CREATE TABLE "gold_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "gold_type" varchar(80) NOT NULL,
  "action" "gold_action" NOT NULL,
  "quantity" numeric(18, 4) NOT NULL,
  "unit" "gold_unit" DEFAULT 'chi' NOT NULL,
  "price_per_unit" numeric(20, 2) NOT NULL,
  "fee" numeric(20, 2) DEFAULT '0' NOT NULL,
  "storage" varchar(160) NOT NULL,
  "note" text,
  "transaction_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "gold_tx_user_time_idx" ON "gold_transactions" ("user_id", "transaction_at" DESC);
CREATE INDEX "gold_tx_user_type_idx" ON "gold_transactions" ("user_id", "gold_type");

CREATE TABLE "stock_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "symbol" varchar(10) NOT NULL,
  "exchange" "exchange" NOT NULL,
  "action" "stock_action" NOT NULL,
  "quantity" integer NOT NULL,
  "price" numeric(20, 2) NOT NULL,
  "brokerage_fee" numeric(20, 2) DEFAULT '0' NOT NULL,
  "tax" numeric(20, 2) DEFAULT '0' NOT NULL,
  "broker" varchar(80),
  "transaction_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "stock_tx_user_symbol_idx" ON "stock_transactions" ("user_id", "symbol");
CREATE INDEX "stock_tx_user_time_idx" ON "stock_transactions" ("user_id", "transaction_at" DESC);

CREATE TABLE "crypto_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "coin_id" varchar(80) NOT NULL,
  "coin_symbol" varchar(20) NOT NULL,
  "action" "crypto_action" NOT NULL,
  "quantity" numeric(30, 8) NOT NULL,
  "price_vnd" numeric(24, 2) NOT NULL,
  "price_usd" numeric(24, 8),
  "usd_vnd_rate" numeric(16, 4),
  "fee" numeric(30, 8) DEFAULT '0' NOT NULL,
  "fee_currency" varchar(20) DEFAULT 'VND' NOT NULL,
  "wallet" varchar(120) NOT NULL,
  "transaction_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "crypto_tx_user_coin_idx" ON "crypto_transactions" ("user_id", "coin_id");
CREATE INDEX "crypto_tx_user_wallet_idx" ON "crypto_transactions" ("user_id", "wallet");

CREATE TABLE "price_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_type" "asset_type" NOT NULL,
  "symbol" varchar(80) NOT NULL,
  "price_buy" numeric(24, 8),
  "price_sell" numeric(24, 8),
  "currency" varchar(10) DEFAULT 'VND' NOT NULL,
  "source" varchar(80) NOT NULL,
  "fetched_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "price_cache_asset_symbol_idx" ON "price_cache" ("asset_type", "symbol");
CREATE INDEX "price_cache_fetched_at_idx" ON "price_cache" ("fetched_at" DESC);

CREATE TABLE "portfolio_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "snapshot_date" date NOT NULL,
  "total_value" numeric(24, 2) NOT NULL,
  "total_invested" numeric(24, 2) NOT NULL,
  "pnl" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "snapshots_user_date_idx" ON "portfolio_snapshots" ("user_id", "snapshot_date");

CREATE TABLE "dividend_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "symbol" varchar(10) NOT NULL,
  "div_type" "dividend_type" NOT NULL,
  "amount_per_share" numeric(20, 4) NOT NULL,
  "record_date" date,
  "payment_date" date,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "dividend_events_user_symbol_idx" ON "dividend_events" ("user_id", "symbol");
