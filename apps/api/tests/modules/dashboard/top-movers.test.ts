import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { computeTopMovers } from '../../../src/modules/dashboard/top-movers.js';

describe('computeTopMovers', () => {
  it('does not show a losing holding as a gainer', () => {
    const result = computeTopMovers([
      { assetClass: 'gold', label: 'Nhẫn Tròn Quang Hạnh 999', value: new Decimal(100), pnl: new Decimal(-25), pnlPct: new Decimal(-25.98) },
    ]);

    expect(result.gainers).toEqual([]);
    expect(result.losers).toEqual([{ assetClass: 'gold', label: 'Nhẫn Tròn Quang Hạnh 999', pnlPct: '-25.98' }]);
  });

  it('separates positive gainers from negative losers', () => {
    const result = computeTopMovers([
      { assetClass: 'gold', label: 'Gold win', value: new Decimal(100), pnl: new Decimal(10), pnlPct: new Decimal(10) },
      { assetClass: 'stock', label: 'Stock loss', value: new Decimal(100), pnl: new Decimal(-5), pnlPct: new Decimal(-5) },
      { assetClass: 'crypto', label: 'Flat', value: new Decimal(100), pnl: new Decimal(0), pnlPct: new Decimal(0) },
    ]);

    expect(result.gainers).toEqual([{ assetClass: 'gold', label: 'Gold win', pnlPct: '10.00' }]);
    expect(result.losers).toEqual([{ assetClass: 'stock', label: 'Stock loss', pnlPct: '-5.00' }]);
  });
});
