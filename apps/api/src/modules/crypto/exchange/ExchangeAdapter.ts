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

export interface ExchangeAdapter {
  verifyKey(creds: ExchangeCreds): Promise<KeyPermissions>;
  fetchTrades(creds: ExchangeCreds, since?: Date): Promise<NormalizedTrade[]>;
}
