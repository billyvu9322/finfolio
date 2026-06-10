import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const goldPrices = pgTable(
  'gold_prices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    source: varchar('source', { length: 40 }).notNull(),
    productName: varchar('product_name', { length: 120 }).notNull(),
    priceBuy: numeric('price_buy', { precision: 24, scale: 2 }),
    priceSell: numeric('price_sell', { precision: 24, scale: 2 }),
    currency: varchar('currency', { length: 10 }).notNull().default('VND'),
    unit: varchar('unit', { length: 10 }).notNull().default('luong'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceProductIdx: uniqueIndex('gold_prices_source_product_idx').on(t.source, t.productName),
    sourceIdx: index('gold_prices_source_idx').on(t.source),
  }),
);

export type GoldPrice = typeof goldPrices.$inferSelect;
export type NewGoldPrice = typeof goldPrices.$inferInsert;
