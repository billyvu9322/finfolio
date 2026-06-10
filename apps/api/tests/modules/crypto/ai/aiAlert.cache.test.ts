import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheGet, cacheSet } from '../../../../src/modules/crypto/ai/aiAlert.cache.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('aiAlert.cache', () => {
  it('returns a fresh value', () => {
    cacheSet('k', { v: 1 }, 1000);
    expect(cacheGet<{ v: number }>('k')).toEqual({ v: 1 });
  });
  it('expires after TTL', () => {
    cacheSet('k2', { v: 2 }, 1000);
    vi.advanceTimersByTime(1500);
    expect(cacheGet('k2')).toBeUndefined();
  });
});
