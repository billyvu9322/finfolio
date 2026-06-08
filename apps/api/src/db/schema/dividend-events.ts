import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, date, timestamp, index } from 'drizzle-orm/pg-core';

import { dividendTypeEnum } from './enums.js';
import { users } from './users.js';

export const dividendEvents = pgTable(
  'dividend_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: varchar('symbol', { length: 10 }).notNull(),
    divType: dividendTypeEnum('div_type').notNull(),
    amountPerShare: numeric('amount_per_share', { precision: 20, scale: 4 }).notNull(),
    recordDate: date('record_date'),
    paymentDate: date('payment_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userSymbolIdx: index('dividend_events_user_symbol_idx').on(t.userId, t.symbol),
  }),
);

export type DividendEvent = typeof dividendEvents.$inferSelect;
export type NewDividendEvent = typeof dividendEvents.$inferInsert;
