import { db } from '../../db/index.js';
import { priceCache, stockTransactions } from '../../db/schema/index.js';
import { fetchVciQuotes } from './market/VciTickerProvider.js';

export const stockPriceService = {
  /**
   * Refresh real VCI prices for the symbols the user actually holds (mirrors
   * `crypto-price.service.refreshCryptoPrices`). No transactions → no network
   * call. Each quote is upserted into `price_cache` (`asset_type='stock'`).
   */
  async refreshStockPrices(): Promise<{ refreshed: number }> {
    const rows = await db.selectDistinct({ symbol: stockTransactions.symbol }).from(stockTransactions);
    const symbols = rows.map((r) => r.symbol);
    if (symbols.length === 0) return { refreshed: 0 };

    const quotes = await fetchVciQuotes(symbols);
    const fetchedAt = new Date();
    for (const q of quotes) {
      await db
        .insert(priceCache)
        .values({
          assetType: 'stock',
          symbol: q.symbol,
          priceBuy: q.price,
          priceSell: q.price,
          currency: 'VND',
          source: 'vci',
          fetchedAt,
        })
        .onConflictDoUpdate({
          target: [priceCache.assetType, priceCache.symbol],
          set: { priceBuy: q.price, priceSell: q.price, currency: 'VND', source: 'vci', fetchedAt },
        });
    }
    return { refreshed: quotes.length };
  },
};
