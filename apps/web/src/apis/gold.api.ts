import { api } from '@/lib/api';

export interface GoldTransaction {
  id: string;
  goldType: string;
  action: 'buy' | 'sell';
  quantity: string;
  unit: 'chi' | 'luong' | 'cay';
  pricePerUnit: string;
  fee: string;
  storage: string;
  note: string | null;
  transactionAt: string;
  createdAt: string;
}

export interface GoldHolding {
  goldType: string;
  quantityChi: string;
  dca: string;
  currentPrice: string;
  currentValue: string;
  unrealizedPnl: string;
  roiPercent: string;
}

export interface GoldPrice {
  symbol: string;
  priceBuy: string | null;
  priceSell: string | null;
  currency: string;
  unit: string;
  source: string;
  fetchedAt: string;
  stale: boolean;
}

export interface GoldTransactionInput {
  goldType: string;
  action: 'buy' | 'sell';
  quantity: string;
  unit: 'chi' | 'luong' | 'cay';
  pricePerUnit: string;
  fee: string;
  storage: string;
  note?: string | null;
  transactionAt?: string;
}

export async function listGoldTransactions() {
  const { data } = await api.get<{ data: GoldTransaction[]; pagination: { page: number; pageSize: number; total: number } }>('/gold/transactions');
  return data;
}

export async function getGoldTransaction(id: string) {
  const { data } = await api.get<{ transaction: GoldTransaction }>(`/gold/transactions/${id}`);
  return data.transaction;
}

export async function getGoldPortfolio() {
  const { data } = await api.get<{ holdings: GoldHolding[]; totalValue: string; totalUnrealizedPnl: string }>('/gold/portfolio');
  return data;
}

export async function getGoldPrices() {
  const { data } = await api.get<{ prices: GoldPrice[]; updatedAt: string | null }>('/gold/prices');
  return data;
}

export interface GoldRefreshResult {
  total: number;
  sources: { key: string; label: string; count?: number; error?: string }[];
}

export async function refreshGoldPrices() {
  const { data } = await api.post<GoldRefreshResult>('/gold/prices/refresh');
  return data;
}

export async function createGoldTransaction(input: GoldTransactionInput) {
  const { data } = await api.post<{ transaction: GoldTransaction }>('/gold/transactions', input);
  return data.transaction;
}

export async function updateGoldTransaction(id: string, input: GoldTransactionInput) {
  const { data } = await api.put<{ transaction: GoldTransaction }>(`/gold/transactions/${id}`, input);
  return data.transaction;
}

export async function deleteGoldTransaction(id: string) {
  await api.delete(`/gold/transactions/${id}`);
}
