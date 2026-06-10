CREATE TABLE "gold_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(40) NOT NULL,
  "product_name" varchar(120) NOT NULL,
  "price_buy" numeric(24,2),
  "price_sell" numeric(24,2),
  "currency" varchar(10) DEFAULT 'VND' NOT NULL,
  "unit" varchar(10) DEFAULT 'luong' NOT NULL,
  "fetched_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "gold_prices_source_product_idx" ON "gold_prices" ("source", "product_name");
CREATE INDEX "gold_prices_source_idx" ON "gold_prices" ("source");
