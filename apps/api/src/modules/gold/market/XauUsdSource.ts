import { env } from '../../../config/env.js';
import type { GoldPriceSource, GoldQuote } from './GoldPriceSource.js';

/**
 * World spot gold XAU/USD (USD per troy ounce) from the free, key-less
 * api.gold-api.com. Display-only (different unit from VN shops) — excluded from
 * VND portfolio valuation. Single spot price → buy = sell.
 */
export class XauUsdSource implements GoldPriceSource {
  readonly key = 'xau';
  readonly label = 'XAU/USD (Thế giới)';

  async fetch(): Promise<GoldQuote[]> {
    const res = await fetch('https://api.gold-api.com/price/XAU', {
      headers: { 'User-Agent': env.GOLD_CRAWL_USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`gold-api XAU -> ${res.status}`);
    const data = (await res.json()) as { price?: number };
    if (typeof data.price !== 'number') throw new Error('gold-api XAU: missing price');
    const spot = data.price.toFixed(2);
    return [{ productName: 'XAU/USD', priceBuy: spot, priceSell: spot, currency: 'USD', unit: 'oz' }];
  }
}
