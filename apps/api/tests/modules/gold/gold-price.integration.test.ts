import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MockGoldPriceSource } from '../../../src/modules/gold/market/MockGoldPriceSource.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('gold price refresh (integration, mock source)', () => {
  // Imported dynamically (pulls in db/env) so collection without a DB stays cheap.
  let goldPriceService: typeof import('../../../src/modules/gold/gold-price.service.js')['goldPriceService'];
  let db: typeof import('../../../src/db/index.js')['db'];
  let goldPrices: typeof import('../../../src/db/schema/index.js')['goldPrices'];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    ({ goldPriceService } = await import('../../../src/modules/gold/gold-price.service.js'));
    ({ db } = await import('../../../src/db/index.js'));
    ({ goldPrices } = await import('../../../src/db/schema/index.js'));
  });

  afterAll(async () => {
    if (db && goldPrices) await db.delete(goldPrices);
  });

  it('imports mock quotes and is idempotent on re-run', async () => {
    const r1 = await goldPriceService.refreshGoldPrices([new MockGoldPriceSource()]);
    expect(r1.total).toBe(2);
    const after1 = (await db.select().from(goldPrices)).filter((row) => row.source === 'mock');
    expect(after1).toHaveLength(2);

    await goldPriceService.refreshGoldPrices([new MockGoldPriceSource()]);
    const after2 = (await db.select().from(goldPrices)).filter((row) => row.source === 'mock');
    expect(after2).toHaveLength(2); // upsert, no duplicates
  });
});
