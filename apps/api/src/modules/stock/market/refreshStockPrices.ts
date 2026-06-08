import { db } from '../../../db/index.js';
import { priceCache } from '../../../db/schema/index.js';
import type { MarketDataProvider } from './MarketDataProvider.js';

export async function refreshStockPrices(provider: MarketDataProvider): Promise<number> {
  const quotes = await provider.fetchStockPrices();
  const fetchedAt = new Date();
  for (const quote of quotes) {
    await db
      .insert(priceCache)
      .values({
        assetType: 'stock',
        symbol: quote.symbol,
        priceBuy: quote.price,
        priceSell: quote.price,
        currency: quote.currency,
        source: quote.source,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [priceCache.assetType, priceCache.symbol],
        set: {
          priceBuy: quote.price,
          priceSell: quote.price,
          currency: quote.currency,
          source: quote.source,
          fetchedAt,
        },
      });
  }
  return quotes.length;
}
