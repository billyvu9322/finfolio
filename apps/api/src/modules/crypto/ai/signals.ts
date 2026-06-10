export type SignalType =
  | 'rsi_overbought'
  | 'rsi_oversold'
  | 'trend_up'
  | 'trend_down'
  | 'breakout_up'
  | 'breakout_down'
  | 'stop_loss'
  | 'take_profit'
  | 'volatility_spike';

export interface Signal {
  type: SignalType;
  dir: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0..1
  detail: string;
}

export interface SignalInput {
  indicators: {
    rsi: number;
    sma20: number;
    sma50: number;
    bollUpper: number;
    bollLower: number;
    price: number;
  };
  holding: { pnlPct: number; change24hPct: number };
}

export function buildSignals(input: SignalInput): Signal[] {
  const { indicators: ind, holding } = input;
  const out: Signal[] = [];

  if (ind.rsi >= 70) {
    out.push({ type: 'rsi_overbought', dir: 'bearish', strength: Math.min(1, (ind.rsi - 70) / 30 + 0.5), detail: `RSI ${ind.rsi.toFixed(0)} — vùng quá mua` });
  } else if (ind.rsi <= 30) {
    out.push({ type: 'rsi_oversold', dir: 'bullish', strength: Math.min(1, (30 - ind.rsi) / 30 + 0.5), detail: `RSI ${ind.rsi.toFixed(0)} — vùng quá bán` });
  }

  if (ind.sma20 > ind.sma50) out.push({ type: 'trend_up', dir: 'bullish', strength: 0.4, detail: 'SMA20 > SMA50 — xu hướng tăng' });
  else if (ind.sma20 < ind.sma50) out.push({ type: 'trend_down', dir: 'bearish', strength: 0.4, detail: 'SMA20 < SMA50 — xu hướng giảm' });

  if (ind.price >= ind.bollUpper) out.push({ type: 'breakout_up', dir: 'bearish', strength: 0.6, detail: 'Giá chạm dải Bollinger trên' });
  else if (ind.price <= ind.bollLower) out.push({ type: 'breakout_down', dir: 'bullish', strength: 0.6, detail: 'Giá chạm dải Bollinger dưới' });

  if (holding.pnlPct <= -10) out.push({ type: 'stop_loss', dir: 'bearish', strength: Math.min(1, Math.abs(holding.pnlPct) / 20), detail: `Lỗ ${holding.pnlPct.toFixed(1)}% so với giá vốn` });
  else if (holding.pnlPct >= 20) out.push({ type: 'take_profit', dir: 'bullish', strength: Math.min(1, holding.pnlPct / 40), detail: `Lãi ${holding.pnlPct.toFixed(1)}% so với giá vốn` });

  if (Math.abs(holding.change24hPct) >= 10) out.push({ type: 'volatility_spike', dir: 'neutral', strength: Math.min(1, Math.abs(holding.change24hPct) / 20), detail: `Biến động 24h ${holding.change24hPct.toFixed(1)}%` });

  return out.sort((a, b) => b.strength - a.strength);
}

export function severityFrom(signals: Signal[]): 'info' | 'warning' | 'critical' {
  if (signals.some((s) => s.type === 'stop_loss' || s.strength >= 0.8)) return 'critical';
  if (signals.length > 0) return 'warning';
  return 'info';
}
