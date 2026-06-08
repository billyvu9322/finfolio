import { describe, expect, it } from 'vitest';

import { computeFeeVnd, computeHolding, type CryptoTx, unrealizedPnl } from '../../../src/modules/crypto/cryptoMath.js';

const tx = (partial: Partial<CryptoTx>): CryptoTx => ({
  action: 'buy',
  quantity: '1',
  priceVnd: '1000000000',
  feeVnd: '0',
  transactionAt: new Date('2026-01-01T00:00:00Z'),
  ...partial,
});

describe('computeFeeVnd', () => {
  it('VND is identity', () => {
    expect(computeFeeVnd('1000', 'VND', '0', 25000).toString()).toBe('1000');
  });

  it('USDT x rate', () => {
    expect(computeFeeVnd('2', 'USDT', '0', 25000).toString()).toBe('50000');
  });

  it('COIN x priceVnd', () => {
    expect(computeFeeVnd('0.001', 'COIN', '1000000000', 25000).toString()).toBe('1000000');
  });
});

describe('computeHolding', () => {
  it('single buy folds feeVnd', () => {
    const holding = computeHolding([tx({ quantity: '0.5', priceVnd: '1000000000', feeVnd: '5000000' })]);
    expect(holding.qty.toString()).toBe('0.5');
    expect(holding.avgCostVnd.toString()).toBe('1010000000');
  });

  it('two buys -> weighted average', () => {
    const holding = computeHolding([
      tx({ quantity: '1', priceVnd: '1000000000', transactionAt: new Date('2026-01-01') }),
      tx({ quantity: '1', priceVnd: '2000000000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(holding.qty.toString()).toBe('2');
    expect(holding.avgCostVnd.toString()).toBe('1500000000');
  });

  it('sell reduces qty, avg unchanged', () => {
    const holding = computeHolding([
      tx({ quantity: '2', priceVnd: '1500000000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'sell', quantity: '0.5', priceVnd: '1800000000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(holding.qty.toString()).toBe('1.5');
    expect(holding.avgCostVnd.toString()).toBe('1500000000');
  });

  it('8-dp precision preserved', () => {
    const holding = computeHolding([tx({ quantity: '0.00000001', priceVnd: '1000000000' })]);
    expect(holding.qty.toString()).toBe('1e-8');
  });

  it('full sell -> qty 0, avg 0', () => {
    const holding = computeHolding([
      tx({ quantity: '1', priceVnd: '1000000000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'sell', quantity: '1', priceVnd: '2000000000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(holding.qty.toString()).toBe('0');
    expect(holding.avgCostVnd.toString()).toBe('0');
  });
});

describe('unrealizedPnl', () => {
  it('gain', () => {
    const result = unrealizedPnl('2', '1000000000', '1200000000');
    expect(result.pnl.toString()).toBe('400000000');
    expect(result.pnlPct.toString()).toBe('20');
  });

  it('zero qty', () => {
    const result = unrealizedPnl('0', '0', '1200000000');
    expect(result.pnl.toString()).toBe('0');
    expect(result.pnlPct.toString()).toBe('0');
  });
});
