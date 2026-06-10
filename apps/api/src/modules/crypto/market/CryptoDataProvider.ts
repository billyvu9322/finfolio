export interface CryptoQuote {
  coinId: string;
  symbol: string;
  priceUsd: string;
  priceVnd: string;
  change24hPct: string;
  source: string;
}

export interface CryptoCandle {
  time: string; // YYYY-MM-DD
  close: number; // VND
}

export interface CryptoDataProvider {
  fetchPrices(): Promise<CryptoQuote[]>;
  fetchFxRate(): Promise<number>;
  fetchOhlc(coinId: string, range: '1m' | '3m' | '6m'): Promise<CryptoCandle[]>;
}
