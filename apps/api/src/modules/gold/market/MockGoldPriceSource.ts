import type { GoldPriceSource, GoldQuote } from './GoldPriceSource.js';

/** Network-free source for tests/dev. */
export class MockGoldPriceSource implements GoldPriceSource {
  readonly key = 'mock';
  readonly label = 'Mock';

  async fetch(): Promise<GoldQuote[]> {
    return [
      { productName: 'SJC 1L', priceBuy: '133800000', priceSell: '138800000' },
      { productName: 'Nhẫn 9999', priceBuy: '133600000', priceSell: '138600000' },
    ];
  }
}
