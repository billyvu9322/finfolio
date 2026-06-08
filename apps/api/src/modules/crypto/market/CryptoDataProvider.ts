export interface CryptoQuote {
  coinId: string;
  symbol: string;
  priceUsd: string;
  priceVnd: string;
  change24hPct: string;
  source: string;
}

export interface CryptoDataProvider {
  fetchPrices(): Promise<CryptoQuote[]>;
  fetchFxRate(): Promise<number>;
}
