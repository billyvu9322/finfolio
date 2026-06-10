import Decimal from 'decimal.js';

import { db } from '../../db/index.js';
import { cryptoPrices, cryptoTransactions } from '../../db/schema/index.js';
import { fetchBinanceTickers } from './market/BinanceTickerProvider.js';
import { SeedCryptoDataProvider } from './market/SeedCryptoDataProvider.js';

const fx = new SeedCryptoDataProvider();
const STALE_MS = 90 * 60 * 1000; // hourly cron → stale after 90 min

export interface CryptoQuoteLite {
  priceVnd: string;
  change24hPct: string | null;
}

export const cryptoPriceService = {
  /** Crawl Binance prices for coins that have transactions. None → no query. */
  async refreshCryptoPrices() {
    const rows = await db.selectDistinct({ symbol: cryptoTransactions.coinSymbol }).from(cryptoTransactions);
    const symbols = rows.map((r) => r.symbol);
    if (symbols.length === 0) return { updated: 0, symbols: [] as string[] };

    const tickers = await fetchBinanceTickers(symbols);
    for (const t of tickers) {
      await db
        .insert(cryptoPrices)
        .values({ coinSymbol: t.coinSymbol, priceUsdt: t.priceUsdt, change24hPct: t.change24hPct, source: 'binance' })
        .onConflictDoUpdate({
          target: cryptoPrices.coinSymbol,
          set: { priceUsdt: t.priceUsdt, change24hPct: t.change24hPct, source: 'binance', fetchedAt: new Date() },
        });
    }
    return { updated: tickers.length, symbols };
  },

  /** symbol → { priceVnd, change24hPct } for portfolio valuation (real Binance prices). */
  async getQuotes(): Promise<Map<string, CryptoQuoteLite>> {
    const rate = await fx.fetchFxRate();
    const rows = await db.select().from(cryptoPrices);
    const map = new Map<string, CryptoQuoteLite>();
    for (const r of rows) {
      map.set(r.coinSymbol, {
        priceVnd: new Decimal(r.priceUsdt).mul(rate).toFixed(2),
        change24hPct: r.change24hPct,
      });
    }
    return map;
  },

  /** Card read: stored Binance prices (USDT) + stale flag. */
  async listCryptoPrices() {
    const rows = await db.select().from(cryptoPrices);
    const now = Date.now();
    return {
      prices: rows
        .map((r) => ({
          coinSymbol: r.coinSymbol,
          priceUsdt: r.priceUsdt,
          change24hPct: r.change24hPct,
          source: r.source,
          fetchedAt: r.fetchedAt,
          stale: now - r.fetchedAt.getTime() > STALE_MS,
        }))
        .sort((a, b) => a.coinSymbol.localeCompare(b.coinSymbol)),
      updatedAt: rows.reduce<Date | null>((latest, r) => (!latest || r.fetchedAt > latest ? r.fetchedAt : latest), null),
    };
  },
};
