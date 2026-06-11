export interface ExchangeCreds {
  apiKey: string;
  apiSecret: string;
}

export interface KeyPermissions {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
}

export interface NormalizedTrade {
  externalTradeId: string;
  coinSymbol: string; // base asset, e.g. BTC
  side: 'buy' | 'sell';
  qty: string;
  priceUsd: string; // quote (USDT≈USD)
  fee: string;
  feeCurrency: string;
  time: Date;
}

/** Current balance of a coin, valued at the exchange's spot price. */
export interface NormalizedHolding {
  coinSymbol: string; // base asset, e.g. XRP (Earn LD-prefix already resolved)
  qty: string; // total free + locked, across spot + Earn
  priceUsd: string; // current spot price (USDT≈USD)
}

export interface ExchangeAdapter {
  verifyKey(creds: ExchangeCreds): Promise<KeyPermissions>;
  fetchTrades(creds: ExchangeCreds, since?: Date): Promise<NormalizedTrade[]>;
  /** Snapshot current holdings (incl. Simple Earn) — used when trade history is unavailable. */
  fetchHoldings(creds: ExchangeCreds): Promise<NormalizedHolding[]>;
}
