import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from './index.js';
import { users } from './schema/index.js';

const BCRYPT_COST = 12; // SRS NFR 4.2 (matches auth.service)

// Override via env when needed: ADMIN_EMAIL / ADMIN_PASSWORD.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'binhhp20';

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);
  const existing = await db.query.users.findFirst({ where: eq(users.email, ADMIN_EMAIL) });

  if (existing) {
    // Idempotent: reset the password so re-running always lands the known credentials.
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, existing.id));
    // eslint-disable-next-line no-console
    console.log('Admin account updated for', ADMIN_EMAIL);
  } else {
    await db
      .insert(users)
      .values({ email: ADMIN_EMAIL, passwordHash, displayName: 'Admin' })
      .returning();
    // eslint-disable-next-line no-console
    console.log('Admin account created for', ADMIN_EMAIL);
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
