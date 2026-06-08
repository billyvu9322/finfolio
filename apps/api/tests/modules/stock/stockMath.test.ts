import { describe, expect, it } from 'vitest';

import { computeHolding, computeStockFees, unrealizedPnl, type StockTx } from '../../../src/modules/stock/stockMath.js';

const tx = (input: Partial<StockTx>): StockTx => ({
  action: 'buy',
  quantity: 100,
  price: '20000',
  brokerageFee: '0',
  tax: '0',
  transactionAt: new Date('2026-01-01T00:00:00Z'),
  ...input,
});

describe('computeStockFees', () => {
  it('buy: 0.15% brokerage, no tax', () => {
    const result = computeStockFees('buy', 100, '20000');
    expect(result.brokerageFee.toString()).toBe('3000');
    expect(result.tax.toString()).toBe('0');
  });

  it('sell: 0.15% brokerage + 0.1% tax', () => {
    const result = computeStockFees('sell', 100, '20000');
    expect(result.brokerageFee.toString()).toBe('3000');
    expect(result.tax.toString()).toBe('2000');
  });
});

describe('computeHolding', () => {
  it('folds buy fees into average cost', () => {
    const holding = computeHolding([tx({ brokerageFee: '3000' })]);
    expect(holding.qty.toString()).toBe('100');
    expect(holding.avgCost.toString()).toBe('20030');
  });

  it('weighted average across buys', () => {
    const holding = computeHolding([
      tx({ quantity: 100, price: '20000', transactionAt: new Date('2026-01-01') }),
      tx({ quantity: 100, price: '30000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(holding.qty.toString()).toBe('200');
    expect(holding.avgCost.toString()).toBe('25000');
  });

  it('sell reduces quantity and preserves average cost', () => {
    const holding = computeHolding([
      tx({ quantity: 200, price: '25000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'sell', quantity: 50, price: '30000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(holding.qty.toString()).toBe('150');
    expect(holding.avgCost.toString()).toBe('25000');
  });

  it('stock dividend raises quantity and lowers average cost', () => {
    const holding = computeHolding([
      tx({ quantity: 100, price: '20000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'stock_dividend', quantity: 100, price: '0', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(holding.qty.toString()).toBe('200');
    expect(holding.avgCost.toString()).toBe('10000');
  });

  it('cash dividend adds income only', () => {
    const holding = computeHolding([
      tx({ quantity: 100, price: '20000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'cash_dividend', quantity: 100, price: '1500', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(holding.qty.toString()).toBe('100');
    expect(holding.avgCost.toString()).toBe('20000');
    expect(holding.dividendIncome.toString()).toBe('150000');
  });
});

describe('unrealizedPnl', () => {
  it('calculates gain and percent', () => {
    const result = unrealizedPnl(200, '25000', '30000');
    expect(result.pnl.toString()).toBe('1000000');
    expect(result.pnlPct.toString()).toBe('20');
  });
});
