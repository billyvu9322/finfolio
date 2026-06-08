import { describe, expect, it } from 'vitest';

import { findSymbol, searchSymbols } from '../../../src/modules/stock/stock.symbols.js';

describe('stock symbols', () => {
  it('finds known symbols case-insensitively', () => {
    expect(findSymbol('fpt')?.exchange).toBe('HOSE');
  });

  it('prefix matches and limits', () => {
    const result = searchSymbols('F', 5);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.some((symbol) => symbol.symbol === 'FPT')).toBe(true);
  });
});
