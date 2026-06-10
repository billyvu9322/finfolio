export function sma(closes: number[], period: number): number {
  if (!closes.length) return 0;
  const p = Math.min(period, closes.length);
  const slice = closes.slice(-p);
  return slice.reduce((a, b) => a + b, 0) / p;
}

export function ema(closes: number[], period: number): number {
  if (!closes.length) return 0;
  const k = 2 / (period + 1);
  let e = closes[0]!;
  for (let i = 1; i < closes.length; i++) e = closes[i]! * k + e * (1 - k);
  return e;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < 2) return 50;
  const n = Math.min(period, closes.length - 1);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  if (gains === 0) return 0;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function stdev(closes: number[], period: number): number {
  if (!closes.length) return 0;
  const p = Math.min(period, closes.length);
  const slice = closes.slice(-p);
  const m = slice.reduce((a, b) => a + b, 0) / p;
  const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / p;
  return Math.sqrt(v);
}

export function bollinger(closes: number[], period = 20, k = 2): { mid: number; upper: number; lower: number } {
  const mid = sma(closes, period);
  const sd = stdev(closes, period);
  return { mid, upper: mid + k * sd, lower: mid - k * sd };
}

export function pctChange(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100;
}
