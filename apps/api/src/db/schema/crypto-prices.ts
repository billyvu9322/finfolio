import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const cryptoPrices = pgTable(
  'crypto_prices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    coinSymbol: varchar('coin_symbol', { length: 20 }).notNull(),
    priceUsdt: numeric('price_usdt', { precision: 24, scale: 8 }).notNull(),
    change24hPct: numeric('change24h_pct', { precision: 12, scale: 4 }),
    source: varchar('source', { length: 40 }).notNull().default('binance'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    coinSymbolIdx: uniqueIndex('crypto_prices_coin_symbol_idx').on(t.coinSymbol),
  }),
);

export type CryptoPrice = typeof cryptoPrices.$inferSelect;
export type NewCryptoPrice = typeof cryptoPrices.$inferInsert;
