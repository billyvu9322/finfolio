import { sql } from 'drizzle-orm';
import { pgTable, uuid, date, numeric, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { users } from './users.js';

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    totalValue: numeric('total_value', { precision: 24, scale: 2 }).notNull(),
    totalInvested: numeric('total_invested', { precision: 24, scale: 2 }).notNull(),
    // Per-asset P&L breakdown, e.g. { gold: {...}, stock: {...}, crypto: {...} }
    pnl: jsonb('pnl').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDateIdx: uniqueIndex('snapshots_user_date_idx').on(t.userId, t.snapshotDate),
  }),
);

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type NewPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;
