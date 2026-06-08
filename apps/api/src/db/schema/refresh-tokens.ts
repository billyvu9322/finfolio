import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';

import { users } from './users.js';

/**
 * Server-side refresh-token store so logout can revoke (FR-AUTH-03).
 * We persist a SHA-256 hash of the token, never the raw value.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    tokenHashIdx: index('refresh_tokens_token_hash_idx').on(t.tokenHash),
  }),
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
