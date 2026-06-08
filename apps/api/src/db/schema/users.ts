import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { currencyEnum } from './enums.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 120 }),
    currency: currencyEnum('currency').notNull().default('VND'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Ho_Chi_Minh'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
