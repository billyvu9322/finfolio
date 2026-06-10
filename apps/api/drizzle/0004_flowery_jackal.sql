CREATE TABLE "crypto_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coin_symbol" varchar(20) NOT NULL,
	"price_usdt" numeric(24, 8) NOT NULL,
	"change24h_pct" numeric(12, 4),
	"source" varchar(40) DEFAULT 'binance' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_prices_coin_symbol_idx" ON "crypto_prices" USING btree ("coin_symbol");