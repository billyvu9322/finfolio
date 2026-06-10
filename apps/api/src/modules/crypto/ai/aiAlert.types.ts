import type { Signal } from './signals.js';

export type Severity = 'info' | 'warning' | 'critical';

export interface AlertContext {
  coinSymbol: string;
  wallet: string;
  holding: { avgCostVnd: string; qty: string; currentPriceVnd: string; pnlPct: string; change24hPct: string };
  indicators: { rsi: number; sma20: number; sma50: number; bollUpper: number; bollLower: number; price: number };
  signals: Signal[];
  severity: Severity;
}

export interface AlertResult {
  severity: Severity;
  title: string;
  message: string;
}

export interface CryptoAlert extends AlertResult {
  coinSymbol: string;
  wallet: string;
  signals: Signal[];
  computedAt: string;
}

export interface AiAlertProvider {
  generate(ctx: AlertContext): Promise<AlertResult>;
}
