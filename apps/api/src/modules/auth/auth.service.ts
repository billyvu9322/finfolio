import { createHash, randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { passwordResetTokens, refreshTokens, users, type User } from '../../db/schema/index.js';
import type { ProfileUpdateBody, UserPublic } from './auth.schema.js';

const BCRYPT_COST = 12; // SRS NFR 4.2
const REFRESH_TTL_DAYS = 30; // FR-AUTH-02
const RESET_TTL_HOURS = 1; // FR-AUTH-04

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function toPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    currency: user.currency,
    timezone: user.timezone,
    createdAt: user.createdAt,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const authService = {
  async register(email: string, password: string, displayName?: string): Promise<UserPublic> {
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      throw new AuthError(409, 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, displayName })
      .returning();

    return toPublic(created!);
  },

  async updateProfile(userId: string, input: ProfileUpdateBody): Promise<UserPublic> {
    const [updated] = await db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) {
      throw new AuthError(401, 'User no longer exists');
    }
    return toPublic(updated);
  },

  async requestPasswordReset(email: string): Promise<{ previewToken?: string }> {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) return {};

    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    return process.env.NODE_ENV === 'production' ? {} : { previewToken: token };
  },

  async resetPassword(token: string, password: string): Promise<void> {
    const row = await db.query.passwordResetTokens.findFirst({
      where: and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt)),
    });
    if (!row || row.expiresAt < new Date()) {
      throw new AuthError(401, 'Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
  },

  async verifyCredentials(email: string, password: string): Promise<User> {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    // Compare even on miss to reduce timing oracle.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinv');
    if (!user || !ok) {
      throw new AuthError(401, 'Invalid email or password');
    }
    return user;
  },

  toPublic,

  /** Mints an opaque refresh token, stores its hash, returns the raw token. */
  async issueRefreshToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokens).values({ userId, tokenHash: hashToken(token), expiresAt });
    return { token, expiresAt };
  },

  /** Validates a refresh token (exists, not revoked, not expired). */
  async validateRefreshToken(token: string): Promise<User> {
    const row = await db.query.refreshTokens.findFirst({
      where: and(eq(refreshTokens.tokenHash, hashToken(token)), isNull(refreshTokens.revokedAt)),
    });
    if (!row || row.expiresAt < new Date()) {
      throw new AuthError(401, 'Invalid refresh token');
    }
    const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!user) {
      throw new AuthError(401, 'Invalid refresh token');
    }
    return user;
  },

  /** Revokes a single refresh token (FR-AUTH-03 logout). */
  async revokeRefreshToken(token: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hashToken(token)));
  },

  /** Resolves the public profile for an authenticated user id (FR-AUTH /me). */
  async validateAccessUser(userId: string): Promise<UserPublic> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      throw new AuthError(401, 'User no longer exists');
    }
    return toPublic(user);
  },
};
