import { describe, expect, it } from 'vitest';

import { resolveCurrentPriceLuong } from '../../../src/modules/gold/gold-price.resolve.js';

const rows = [
  { source: 'sjc', productName: 'Vàng SJC 1L, 10L, 1KG', priceBuy: '133800000' },
  { source: 'doji', productName: 'SJC Lẻ', priceBuy: '134400000' },
  { source: 'sjc', productName: 'Vàng nhẫn SJC 99,99% 1 chỉ', priceBuy: '133600000' },
  { source: 'thanhlien', productName: 'Vàng Thành Liên 9999 24k', priceBuy: '135500000' },
];

describe('resolveCurrentPriceLuong', () => {
  it('matches SJC bar by substring, sjc source preferred over doji', () => {
    expect(resolveCurrentPriceLuong('SJC 1L', rows)).toBe('133800000');
  });

  it('prefers exact/substring product match', () => {
    expect(resolveCurrentPriceLuong('Vàng Thành Liên 9999 24k', rows)).toBe('135500000');
  });

  it('returns null when nothing matches', () => {
    expect(resolveCurrentPriceLuong('Bạc miếng', rows)).toBeNull();
  });

  it('skips rows without a buy price', () => {
    expect(resolveCurrentPriceLuong('SJC', [{ source: 'sjc', productName: 'SJC 1L', priceBuy: null }])).toBeNull();
  });
});
