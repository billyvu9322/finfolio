import { describe, expect, it } from 'vitest';

import { calculateGoldPortfolio, toChi } from '../../../src/modules/gold/gold.calc.js';

describe('gold calculation engine', () => {
  it('converts Vietnamese gold units to canonical chi', () => {
    expect(toChi('1', 'chi')).toBe('1.0000');
    expect(toChi('1', 'luong')).toBe('10.0000');
    expect(toChi('1', 'cay')).toBe('10.0000');
  });

  it('calculates FIFO-adjusted DCA and unrealized P&L after partial sells', () => {
    const portfolio = calculateGoldPortfolio(
      [
        tx('buy', 'SJC 9999', '1', 'chi', '7000000', '100000', '2026-01-01T00:00:00.000Z'),
        tx('buy', 'SJC 9999', '1', 'chi', '8000000', '0', '2026-01-02T00:00:00.000Z'),
        tx('sell', 'SJC 9999', '0.5', 'chi', '7600000', '0', '2026-01-03T00:00:00.000Z'),
      ],
      { 'SJC 9999': '9000000' },
    );

    expect(portfolio.holdings).toEqual([
      {
        goldType: 'SJC 9999',
        quantityChi: '1.5000',
        dca: '7700000.00',
        currentPrice: '9000000.00',
        currentValue: '13500000.00',
        unrealizedPnl: '1950000.00',
        roiPercent: '16.88',
      },
    ]);
    expect(portfolio.totalValue).toBe('13500000.00');
    expect(portfolio.totalUnrealizedPnl).toBe('1950000.00');
  });

  it('rejects sells that exceed held quantity', () => {
    expect(() =>
      calculateGoldPortfolio(
        [
          tx('buy', 'SJC 9999', '1', 'chi', '7000000', '0', '2026-01-01T00:00:00.000Z'),
          tx('sell', 'SJC 9999', '2', 'chi', '7600000', '0', '2026-01-02T00:00:00.000Z'),
        ],
        {},
      ),
    ).toThrow(/exceeds holdings/);
  });
});

function tx(
  action: 'buy' | 'sell',
  goldType: string,
  quantity: string,
  unit: 'chi' | 'luong' | 'cay',
  pricePerUnit: string,
  fee: string,
  transactionAt: string,
) {
  return {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    action,
    goldType,
    quantity,
    unit,
    pricePerUnit,
    fee,
    storage: 'Home',
    note: null,
    transactionAt: new Date(transactionAt),
    createdAt: new Date(transactionAt),
  };
}
