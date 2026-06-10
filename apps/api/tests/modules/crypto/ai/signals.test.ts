import { describe, expect, it } from 'vitest';

import { buildSignals, severityFrom, type SignalInput } from '../../../../src/modules/crypto/ai/signals.js';

const base: SignalInput = {
  indicators: { rsi: 50, sma20: 100, sma50: 100, bollUpper: 130, bollLower: 70, price: 100 },
  holding: { pnlPct: 0, change24hPct: 0 },
};

describe('buildSignals', () => {
  it('flags overbought', () => {
    const s = buildSignals({ ...base, indicators: { ...base.indicators, rsi: 80 } });
    expect(s.some((x) => x.type === 'rsi_overbought')).toBe(true);
  });
  it('flags oversold', () => {
    const s = buildSignals({ ...base, indicators: { ...base.indicators, rsi: 20 } });
    expect(s.some((x) => x.type === 'rsi_oversold')).toBe(true);
  });
  it('flags stop_loss at -10%', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: -12, change24hPct: 0 } });
    expect(s.some((x) => x.type === 'stop_loss')).toBe(true);
  });
  it('flags take_profit at +20%', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: 25, change24hPct: 0 } });
    expect(s.some((x) => x.type === 'take_profit')).toBe(true);
  });
  it('flags volatility spike', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: 0, change24hPct: -15 } });
    expect(s.some((x) => x.type === 'volatility_spike')).toBe(true);
  });
  it('calm market → no actionable signals', () => {
    expect(buildSignals(base).length).toBe(0);
  });
});

describe('severityFrom', () => {
  it('critical when stop_loss present', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: -20, change24hPct: 0 } });
    expect(severityFrom(s)).toBe('critical');
  });
  it('info on empty', () => expect(severityFrom([])).toBe('info'));
});
