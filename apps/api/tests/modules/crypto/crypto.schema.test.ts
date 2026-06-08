import { describe, expect, it } from 'vitest';

import { createCryptoTxSchema, swapBodySchema, updateCryptoTxSchema } from '../../../src/modules/crypto/crypto.schema.js';

const valid = {
  coinId: 'bitcoin',
  coinSymbol: 'btc',
  action: 'buy',
  quantity: 0.5,
  price: 1000000000,
  wallet: 'Binance',
};

describe('createCryptoTxSchema', () => {
  it('accepts valid + uppercases symbol + defaults', () => {
    const result = createCryptoTxSchema.parse(valid);
    expect(result.coinSymbol).toBe('BTC');
    expect(result.priceCurrency).toBe('VND');
    expect(result.feeCurrency).toBe('VND');
    expect(result.fee).toBe(0);
  });

  it('rejects quantity <= 0', () => {
    expect(createCryptoTxSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false);
  });

  it('rejects > 8 decimals', () => {
    expect(createCryptoTxSchema.safeParse({ ...valid, quantity: 0.000000001 }).success).toBe(false);
  });

  it('rejects bad priceCurrency', () => {
    expect(createCryptoTxSchema.safeParse({ ...valid, priceCurrency: 'EUR' }).success).toBe(false);
  });
});

describe('swapBodySchema', () => {
  const swap = {
    sourceCoinId: 'bitcoin',
    sourceSymbol: 'BTC',
    sourceQty: 0.1,
    destCoinId: 'ethereum',
    destSymbol: 'ETH',
    destQty: 1.5,
    valueVnd: 100000000,
    wallet: 'Binance',
  };

  it('accepts valid', () => {
    expect(swapBodySchema.safeParse(swap).success).toBe(true);
  });

  it('rejects zero qty', () => {
    expect(swapBodySchema.safeParse({ ...swap, sourceQty: 0 }).success).toBe(false);
  });
});

describe('updateCryptoTxSchema', () => {
  it('rejects empty', () => {
    expect(updateCryptoTxSchema.safeParse({}).success).toBe(false);
  });
});
