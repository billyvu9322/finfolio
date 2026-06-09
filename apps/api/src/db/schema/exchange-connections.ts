import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

import { connectionStatusEnum, exchangeProviderEnum } from './enums.js';
import { users } from './users.js';

export const exchangeConnections = pgTable(
  'exchange_connections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exchange: exchangeProviderEnum('exchange').notNull(),
    label: varchar('label', { length: 80 }),
    apiKeyEnc: text('api_key_enc').notNull(),
    apiSecretEnc: text('api_secret_enc').notNull(),
    readOnly: boolean('read_only').notNull().default(true),
    status: connectionStatusEnum('status').notNull().default('active'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('exchange_connections_user_idx').on(t.userId) }),
);

export type ExchangeConnection = typeof exchangeConnections.$inferSelect;
export type NewExchangeConnection = typeof exchangeConnections.$inferInsert;
