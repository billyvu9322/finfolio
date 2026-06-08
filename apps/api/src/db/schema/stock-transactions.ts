import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';

import { stockActionEnum, exchangeEnum } from './enums.js';
import { users } from './users.js';

export const stockTransactions = pgTable(
  'stock_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: varchar('symbol', { length: 10 }).notNull(),
    exchange: exchangeEnum('exchange').notNull(),
    action: stockActionEnum('action').notNull(),
    quantity: integer('quantity').notNull(),
    price: numeric('price', { precision: 20, scale: 2 }).notNull(),
    brokerageFee: numeric('brokerage_fee', { precision: 20, scale: 2 }).notNull().default('0'),
    tax: numeric('tax', { precision: 20, scale: 2 }).notNull().default('0'),
    broker: varchar('broker', { length: 80 }),
    transactionAt: timestamp('transaction_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userSymbolIdx: index('stock_tx_user_symbol_idx').on(t.userId, t.symbol),
    userTimeIdx: index('stock_tx_user_time_idx').on(t.userId, t.transactionAt.desc()),
  }),
);

export type StockTransaction = typeof stockTransactions.$inferSelect;
export type NewStockTransaction = typeof stockTransactions.$inferInsert;
