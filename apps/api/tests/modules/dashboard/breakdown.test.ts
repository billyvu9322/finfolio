import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { computeBreakdown } from '../../../src/modules/dashboard/breakdown.js';

describe('computeBreakdown', () => {
  it('computes pct of total', () => {
    const result = computeBreakdown([
      { key: 'gold', value: new Decimal(30) },
      { key: 'stock', value: new Decimal(70) },
    ]);
    expect(result.find((item) => item.key === 'gold')!.pct).toBe('30.00');
    expect(result.find((item) => item.key === 'stock')!.pct).toBe('70.00');
  });

  it('returns 0 pct when total is 0', () => {
    const result = computeBreakdown([{ key: 'gold', value: new Decimal(0) }]);
    expect(result[0]!.pct).toBe('0.00');
  });
});
