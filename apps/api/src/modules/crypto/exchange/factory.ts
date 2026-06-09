import { BinanceAdapter } from './BinanceAdapter.js';
import type { ExchangeAdapter } from './ExchangeAdapter.js';

export function adapterFor(exchange: string): ExchangeAdapter {
  if (exchange === 'binance') return new BinanceAdapter();
  throw new Error(`Exchange not supported yet: ${exchange}`);
}
