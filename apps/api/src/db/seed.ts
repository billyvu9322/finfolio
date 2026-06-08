import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from './index.js';
import { goldTransactions, users } from './schema/index.js';

const DEMO_EMAIL = 'demo@finfolio.local';
const DEMO_PASSWORD = 'Demo1234';

async function main() {
  const existing = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({
          email: DEMO_EMAIL,
          passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
          displayName: 'Demo User',
        })
        .returning()
    )[0]!;

  const existingGold = await db.query.goldTransactions.findFirst({
    where: eq(goldTransactions.userId, user.id),
  });
  if (!existingGold) {
    await db.insert(goldTransactions).values({
      userId: user.id,
      goldType: 'SJC 9999',
      action: 'buy',
      quantity: '1',
      unit: 'chi',
      pricePerUnit: '7400000',
      fee: '0',
      storage: 'Home safe',
      note: 'Seed sample transaction',
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
