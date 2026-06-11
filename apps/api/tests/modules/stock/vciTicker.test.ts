import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchVciQuotes } from '../../../src/modules/stock/market/VciTickerProvider.js';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(rows: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => rows })) as unknown as typeof fetch,
  );
}

describe('fetchVciQuotes', () => {
  it('returns empty for no symbols (no network call)', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy as unknown as typeof fetch);
    expect(await fetchVciQuotes([])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('takes the last close as the price, in VND (no scaling)', async () => {
    stubFetch([{ symbol: 'FPT', o: [71200, 73500], h: [72500, 74500], l: [70800, 73500], c: [71600, 73600], v: [1, 2], t: ['1', '2'] }]);
    const quotes = await fetchVciQuotes(['FPT']);
    expect(quotes).toEqual([{ symbol: 'FPT', price: '73600' }]);
  });

  it('skips symbols with empty/invalid data instead of throwing', async () => {
    stubFetch([{ symbol: 'XXX', o: [], h: [], l: [], c: [], v: [], t: [] }]);
    expect(await fetchVciQuotes(['XXX'])).toEqual([]);
  });
});
