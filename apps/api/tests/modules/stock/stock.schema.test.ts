import { describe, expect, it } from 'vitest';

import { createStockTxSchema, ohlcQuerySchema, updateStockTxSchema } from '../../../src/modules/stock/stock.schema.js';

const valid = { symbol: 'fpt', action: 'buy', quantity: 100, price: 90000 };

describe('stock schemas', () => {
  it('accepts valid create payload and uppercases symbol', () => {
    const result = createStockTxSchema.parse(valid);
    expect(result.symbol).toBe('FPT');
  });

  it('rejects non-integer quantity', () => {
    expect(createStockTxSchema.safeParse({ ...valid, quantity: 1.5 }).success).toBe(false);
  });

  it('rejects empty update payloads', () => {
    expect(updateStockTxSchema.safeParse({}).success).toBe(false);
  });

  it('defaults ohlc range to 3m', () => {
    expect(ohlcQuerySchema.parse({}).range).toBe('3m');
  });
});
