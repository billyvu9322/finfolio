import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, timestamp, index } from 'drizzle-orm/pg-core';

import { cryptoActionEnum } from './enums.js';
import { users } from './users.js';

export const cryptoTransactions = pgTable(
  'crypto_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    coinId: varchar('coin_id', { length: 80 }).notNull(),
    coinSymbol: varchar('coin_symbol', { length: 20 }).notNull(),
    action: cryptoActionEnum('action').notNull(),
    quantity: numeric('quantity', { precision: 30, scale: 8 }).notNull(),
    priceVnd: numeric('price_vnd', { precision: 24, scale: 2 }).notNull(),
    priceUsd: numeric('price_usd', { precision: 24, scale: 8 }),
    usdVndRate: numeric('usd_vnd_rate', { precision: 16, scale: 4 }),
    fee: numeric('fee', { precision: 30, scale: 8 }).notNull().default('0'),
    feeCurrency: varchar('fee_currency', { length: 20 }).notNull().default('VND'),
    wallet: varchar('wallet', { length: 120 }).notNull(),
    transactionAt: timestamp('transaction_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCoinIdx: index('crypto_tx_user_coin_idx').on(t.userId, t.coinId),
    userWalletIdx: index('crypto_tx_user_wallet_idx').on(t.userId, t.wallet),
  }),
);

export type CryptoTransaction = typeof cryptoTransactions.$inferSelect;
export type NewCryptoTransaction = typeof cryptoTransactions.$inferInsert;
