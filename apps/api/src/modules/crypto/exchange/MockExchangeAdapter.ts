import type { ExchangeAdapter, ExchangeCreds, KeyPermissions, NormalizedHolding, NormalizedTrade } from './ExchangeAdapter.js';

/** Test/dev adapter. `apiKey` encodes intent: 'withdraw' → canWithdraw true, 'trade' → canTrade true. */
export class MockExchangeAdapter implements ExchangeAdapter {
  async verifyKey(creds: ExchangeCreds): Promise<KeyPermissions> {
    return {
      canTrade: creds.apiKey.includes('trade'),
      canWithdraw: creds.apiKey.includes('withdraw'),
      canDeposit: true,
    };
  }

  async fetchTrades(_creds: ExchangeCreds, _since?: Date): Promise<NormalizedTrade[]> {
    return [
      { externalTradeId: 'm1', coinSymbol: 'BTC', side: 'buy', qty: '0.01', priceUsd: '60000', fee: '0.6', feeCurrency: 'USDT', time: new Date('2026-01-02T00:00:00Z') },
      { externalTradeId: 'm2', coinSymbol: 'ETH', side: 'buy', qty: '0.5', priceUsd: '3000', fee: '1.5', feeCurrency: 'USDT', time: new Date('2026-01-03T00:00:00Z') },
    ];
  }

  async fetchHoldings(_creds: ExchangeCreds): Promise<NormalizedHolding[]> {
    return [
      { coinSymbol: 'BTC', qty: '0.01', priceUsd: '65000' },
      { coinSymbol: 'ETH', qty: '0.5', priceUsd: '3200' },
    ];
  }
}
