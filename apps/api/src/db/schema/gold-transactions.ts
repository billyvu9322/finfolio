import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, timestamp, text, index } from 'drizzle-orm/pg-core';

import { goldActionEnum, goldUnitEnum } from './enums.js';
import { users } from './users.js';

export const goldTransactions = pgTable(
  'gold_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    goldType: varchar('gold_type', { length: 80 }).notNull(),
    action: goldActionEnum('action').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unit: goldUnitEnum('unit').notNull().default('chi'),
    pricePerUnit: numeric('price_per_unit', { precision: 20, scale: 2 }).notNull(),
    fee: numeric('fee', { precision: 20, scale: 2 }).notNull().default('0'),
    storage: varchar('storage', { length: 160 }).notNull(),
    note: text('note'),
    transactionAt: timestamp('transaction_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTimeIdx: index('gold_tx_user_time_idx').on(t.userId, t.transactionAt.desc()),
    userTypeIdx: index('gold_tx_user_type_idx').on(t.userId, t.goldType),
  }),
);

export type GoldTransaction = typeof goldTransactions.$inferSelect;
export type NewGoldTransaction = typeof goldTransactions.$inferInsert;
