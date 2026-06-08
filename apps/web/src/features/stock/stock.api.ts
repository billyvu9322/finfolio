import { api } from '@/lib/api';
import type { StockAction } from './fees';

export type Exchange = 'HOSE' | 'HNX' | 'UPCOM';

export interface SymbolEntry { symbol: string; exchange: Exchange; name: string }
export interface StockTx { id: string; symbol: string; exchange: Exchange; action: StockAction; quantity: number; price: string; brokerageFee: string; tax: string; broker: string | null; transactionAt: string; createdAt: string }
export interface StockHolding { symbol: string; exchange: Exchange; qty: string; avgCost: string; currentPrice: string | null; value: string | null; weightPct: string | null; pnl: string | null; pnlPct: string | null; dividendIncome: string }
export interface StockPortfolio { holdings: StockHolding[]; totals: { value: string; invested: string; pnl: string; pnlPct: string; dividendIncome: string } }
export interface Candle { time: string; open: number; high: number; low: number; close: number }
export interface Ohlc { candles: Candle[]; markers: { time: string; action: StockAction; price: string }[] }
export interface CreateStockTxBody { symbol: string; exchange?: Exchange; action: StockAction; quantity: number; price: number; brokerageFee?: number; tax?: number; broker?: string; transactionAt?: string }

export async function searchSymbols(q: string) {
  const { data } = await api.get<{ symbols: SymbolEntry[] }>('/stocks/symbols', { params: { q } });
  return data.symbols;
}

export async function listStockTx(params: { symbol?: string; page?: number; limit?: number } = {}) {
  const { data } = await api.get<{ data: StockTx[]; pagination: { page: number; limit: number; total: number } }>('/stocks/transactions', { params });
  return data;
}

export async function createStockTx(body: CreateStockTxBody) {
  const { data } = await api.post<StockTx>('/stocks/transactions', body);
  return data;
}

export async function getStockPortfolio() {
  const { data } = await api.get<StockPortfolio>('/stocks/portfolio');
  return data;
}

export async function getStockOhlc(symbol: string, range: '1m' | '3m' | '6m' = '3m') {
  const { data } = await api.get<Ohlc>(`/stocks/${symbol}/ohlc`, { params: { range } });
  return data;
}
