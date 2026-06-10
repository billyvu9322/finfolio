import { describe, expect, it } from 'vitest';

import { bollinger, ema, pctChange, rsi, sma } from '../../../../src/modules/crypto/ai/indicators.js';

describe('sma', () => {
  it('averages the last N', () => expect(sma([1, 2, 3, 4], 4)).toBe(2.5));
  it('clamps period to length', () => expect(sma([2, 4], 10)).toBe(3));
});

describe('ema', () => {
  it('equals the single value', () => expect(ema([5], 10)).toBe(5));
  it('is finite for a series', () => expect(Number.isFinite(ema([1, 2, 3, 4, 5], 3))).toBe(true));
});

describe('rsi', () => {
  it('all-up → 100', () => expect(rsi([1, 2, 3, 4, 5, 6], 5)).toBe(100));
  it('all-down → 0', () => expect(rsi([6, 5, 4, 3, 2, 1], 5)).toBe(0));
  it('within 0..100', () => {
    const v = rsi([1, 2, 1, 2, 1, 2, 3], 6);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe('bollinger', () => {
  it('mid equals sma', () => {
    const closes = [10, 12, 14, 16, 18];
    expect(bollinger(closes, 5).mid).toBe(sma(closes, 5));
  });
});

describe('pctChange', () => {
  it('computes %', () => expect(pctChange(100, 120)).toBe(20));
  it('zero base → 0', () => expect(pctChange(0, 5)).toBe(0));
});
