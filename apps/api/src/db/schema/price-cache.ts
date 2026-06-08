import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

import { assetTypeEnum } from './enums.js';

export const priceCache = pgTable(
  'price_cache',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetType: assetTypeEnum('asset_type').notNull(),
    symbol: varchar('symbol', { length: 80 }).notNull(),
    priceBuy: numeric('price_buy', { precision: 24, scale: 8 }),
    priceSell: numeric('price_sell', { precision: 24, scale: 8 }),
    currency: varchar('currency', { length: 10 }).notNull().default('VND'),
    source: varchar('source', { length: 80 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assetSymbolIdx: uniqueIndex('price_cache_asset_symbol_idx').on(t.assetType, t.symbol),
    fetchedAtIdx: index('price_cache_fetched_at_idx').on(t.fetchedAt.desc()),
  }),
);

export type PriceCache = typeof priceCache.$inferSelect;
export type NewPriceCache = typeof priceCache.$inferInsert;
