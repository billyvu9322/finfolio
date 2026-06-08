export interface StockQuote {
  symbol: string;
  price: string;
  currency: 'VND';
  source: string;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketDataProvider {
  fetchStockPrices(): Promise<StockQuote[]>;
  fetchOhlc(symbol: string, range: '1m' | '3m' | '6m'): Promise<Candle[]>;
}
