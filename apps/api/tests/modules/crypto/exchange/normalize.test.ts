import { describe, expect, it } from 'vitest';

import { normalizeTrade } from '../../../../src/modules/crypto/exchange/normalize.js';

describe('normalizeTrade', () => {
  it('maps a buy fill to a crypto_transactions insert with VND price', () => {
    const row = normalizeTrade(
      'user-1',
      'binance',
      'Binance',
      { externalTradeId: 'BTCUSDT:1', coinSymbol: 'BTC', side: 'buy', qty: '0.01', priceUsd: '60000', fee: '0.6', feeCurrency: 'USDT', time: new Date('2026-01-02') },
      25000,
    );
    expect(row.coinSymbol).toBe('BTC');
    expect(row.coinId).toBe('bitcoin');
    expect(row.action).toBe('buy');
    expect(row.source).toBe('binance');
    expect(row.externalTradeId).toBe('BTCUSDT:1');
    expect(row.priceVnd).toBe('1500000000.00'); // 60000 * 25000
    expect(row.priceUsd).toBe('60000');
    expect(row.usdVndRate).toBe('25000');
  });
});
