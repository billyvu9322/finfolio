import { CRYPTO_COINS } from '../crypto.coins.js';
import type { CryptoDataProvider, CryptoQuote } from './CryptoDataProvider.js';

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
}
