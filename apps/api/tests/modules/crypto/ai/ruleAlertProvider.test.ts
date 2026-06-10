import { describe, expect, it } from 'vitest';

import type { AlertContext } from '../../../../src/modules/crypto/ai/aiAlert.types.js';
import { ruleAlertProvider } from '../../../../src/modules/crypto/ai/ruleAlertProvider.js';

const ctx: AlertContext = {
  coinSymbol: 'BTC',
  wallet: 'Binance',
  holding: { avgCostVnd: '1000000000', qty: '0.5', currentPriceVnd: '800000000', pnlPct: '-20', change24hPct: '-5' },
  indicators: { rsi: 25, sma20: 90, sma50: 100, bollUpper: 130, bollLower: 70, price: 80 },
  signals: [
    { type: 'stop_loss', dir: 'bearish', strength: 1, detail: 'Lỗ 20%' },
    { type: 'rsi_oversold', dir: 'bullish', strength: 0.7, detail: 'RSI 25' },
  ],
  severity: 'critical',
};

describe('ruleAlertProvider', () => {
  it('returns the ctx severity and a non-empty message', async () => {
    const r = await ruleAlertProvider.generate(ctx);
    expect(r.severity).toBe('critical');
    expect(r.title).toContain('BTC');
    expect(r.message.length).toBeGreaterThan(0);
  });
});
