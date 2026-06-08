import { api } from '@/lib/api';

export interface Summary {
  aum: string;
  invested: string;
  pnl: string;
  pnlPct: string;
  breakdown: { assetClass: string; value: string; pct: string; pnl: string }[];
}

export interface GrowthPoint {
  date: string;
  value: string;
}

export interface RecentTx {
  assetClass: string;
  title: string;
  subtitle: string;
  action: string;
  amount: string;
  date: string;
}

export interface TopHolding {
  assetClass: string;
  label: string;
  value: string;
  pnlPct: string | null;
}

export interface Movers {
  gainers: { assetClass: string; label: string; pnlPct: string }[];
  losers: { assetClass: string; label: string; pnlPct: string }[];
}

export const getSummary = async () => (await api.get<Summary>('/dashboard/summary')).data;
export const getGrowth = async (period: string) => (await api.get<{ data: GrowthPoint[] }>('/dashboard/growth', { params: { period } })).data.data;
export const getRecentTransactions = async (limit = 10) => (await api.get<{ data: RecentTx[] }>('/dashboard/recent-transactions', { params: { limit } })).data.data;
export const getTopHoldings = async (limit = 5) => (await api.get<{ data: TopHolding[] }>('/dashboard/top-holdings', { params: { limit } })).data.data;
export const getTopMovers = async () => (await api.get<Movers>('/dashboard/top-movers')).data;
export const createSnapshot = async () => (await api.post<{ snapshotDate: string }>('/dashboard/snapshot')).data;
