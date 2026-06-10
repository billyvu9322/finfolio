import { CRYPTO_COINS } from '../crypto.coins.js';
import type { CryptoCandle, CryptoDataProvider, CryptoQuote } from './CryptoDataProvider.js';

const FX = 25000;

function usdPrice(symbol: string): number {
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if (symbol === 'BTC') return 65000;
  if (symbol === 'ETH') return 3200;
  if (symbol === 'USDT' || symbol === 'USDC') return 1;
  return 0.5 + (seed % 500);
}

function change24h(symbol: string): number {
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Number((((seed % 200) - 100) / 10).toFixed(2));
}

export class SeedCryptoDataProvider implements CryptoDataProvider {
  async fetchPrices(): Promise<CryptoQuote[]> {
    return CRYPTO_COINS.map((coin) => {
      const usd = usdPrice(coin.symbol);
      return {
        coinId: coin.coinId,
        symbol: coin.symbol,
        priceUsd: String(usd),
        priceVnd: String(usd * FX),
        change24hPct: String(change24h(coin.symbol)),
        source: 'seed',
      };
    });
  }

  async fetchFxRate(): Promise<number> {
    return FX;
  }

  async fetchOhlc(coinId: string, range: '1m' | '3m' | '6m'): Promise<CryptoCandle[]> {
    const days = { '1m': 30, '3m': 90, '6m': 180 }[range];
    const coin = CRYPTO_COINS.find((c) => c.coinId === coinId);
    const base = (coin ? usdPrice(coin.symbol) : 100) * FX; // VND base
    let seed = [...coinId].reduce((s, c) => s + c.charCodeAt(0), 11);
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const out: CryptoCandle[] = [];
    let prev = base;
    const start = new Date();
    start.setDate(start.getDate() - days);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const close = Math.max(1, Math.round(prev + (rand() - 0.5) * 0.06 * base)); // ±3%
      out.push({ time: d.toISOString().slice(0, 10), close });
      prev = close;
    }
    return out;
  }
}
