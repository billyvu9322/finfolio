import { describe, expect, it } from 'vitest';

import { findCoin, searchCoins } from '../../../src/modules/crypto/crypto.coins.js';

describe('findCoin', () => {
  it('finds by symbol case-insensitive', () => {
    expect(findCoin('btc')?.coinId).toBe('bitcoin');
  });

  it('finds by coinId', () => {
    expect(findCoin('ethereum')?.symbol).toBe('ETH');
  });

  it('undefined when unknown', () => {
    expect(findCoin('ZZZ')).toBeUndefined();
  });
});

describe('searchCoins', () => {
  it('matches prefix/name and limits', () => {
    const result = searchCoins('bit', 5);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.some((coin) => coin.symbol === 'BTC')).toBe(true);
  });
});
