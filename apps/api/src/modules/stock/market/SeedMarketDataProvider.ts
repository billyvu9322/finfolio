import { STOCK_SYMBOLS } from '../stock.symbols.js';
import type { Candle, MarketDataProvider, StockQuote } from './MarketDataProvider.js';

const RANGE_DAYS = { '1m': 30, '3m': 90, '6m': 180 } as const;

function basePrice(symbol: string): number {
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 20_000 + (seed % 80) * 1_000;
}

export class SeedMarketDataProvider implements MarketDataProvider {
  async fetchStockPrices(): Promise<StockQuote[]> {
    return STOCK_SYMBOLS.map((entry) => ({
      symbol: entry.symbol,
      price: String(basePrice(entry.symbol)),
      currency: 'VND',
      source: 'seed',
    }));
  }

  async fetchOhlc(symbol: string, range: '1m' | '3m' | '6m'): Promise<Candle[]> {
    const normalized = symbol.toUpperCase();
    const days = RANGE_DAYS[range];
    const base = basePrice(normalized);
    const candles: Candle[] = [];
    let previous = base;
    let seed = [...normalized].reduce((sum, char) => sum + char.charCodeAt(0), 7);
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const start = new Date();
    start.setDate(start.getDate() - days);
    for (let index = 0; index < days; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const open = previous;
      const close = Math.max(1_000, Math.round(open + (rand() - 0.5) * 0.04 * base));
      const high = Math.max(open, close) + Math.round(rand() * 0.01 * base);
      const low = Math.max(1_000, Math.min(open, close) - Math.round(rand() * 0.01 * base));
      candles.push({ time: date.toISOString().slice(0, 10), open, high, low, close });
      previous = close;
    }
    return candles;
  }
}
