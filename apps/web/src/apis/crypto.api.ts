import { api } from '@/lib/api';

export interface Coin {
  coinId: string;
  symbol: string;
  name: string;
}

export interface CryptoHolding {
  coinSymbol: string;
  wallet: string;
  qty: string;
  avgCostVnd: string;
  currentPriceVnd: string | null;
  valueVnd: string | null;
  valueUsd: string | null;
  pnlVnd: string | null;
  pnlPct: string | null;
  change24hPct: string | null;
  weightPct: string | null;
}

export interface CryptoPortfolio {
  holdings: CryptoHolding[];
  totals: { valueVnd: string; valueUsd: string; invested: string; pnl: string; pnlPct: string };
  fxRate: number;
}

export interface CryptoQuote {
  coinId: string;
  symbol: string;
  priceUsd: string;
  priceVnd: string;
  change24hPct: string;
  source: string;
}

export interface CreateCryptoTxBody {
  coinId: string;
  coinSymbol: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
  priceCurrency?: 'VND' | 'USDT';
  usdVndRate?: number;
  fee?: number;
  feeCurrency?: 'VND' | 'USDT' | 'COIN';
  wallet: string;
  transactionAt?: string;
}

export interface SwapBody {
  sourceCoinId: string;
  sourceSymbol: string;
  sourceQty: number;
  destCoinId: string;
  destSymbol: string;
  destQty: number;
  valueVnd: number;
  wallet: string;
  transactionAt?: string;
}

export const searchCoins = async (query: string) => {
  const response = await api.get<{ coins: Coin[] }>('/crypto/coins', { params: { q: query } });
  return response.data.coins;
};

export const listCryptoTx = async (params: { coinSymbol?: string; wallet?: string; page?: number; limit?: number } = {}) => {
  const response = await api.get<{ data: unknown[]; pagination: { page: number; limit: number; total: number } }>('/crypto/transactions', { params });
  return response.data;
};

export const createCryptoTx = async (body: CreateCryptoTxBody) => {
  const response = await api.post('/crypto/transactions', body);
  return response.data;
};

export const swapCrypto = async (body: SwapBody) => {
  const response = await api.post('/crypto/swap', body);
  return response.data;
};

export const getCryptoPortfolio = async (fx?: number) => {
  const response = await api.get<CryptoPortfolio>('/crypto/portfolio', { params: { fx } });
  return response.data;
};

export const getCryptoPrices = async (fx?: number) => {
  const response = await api.get<{ quotes: CryptoQuote[]; fxRate: number }>('/crypto/prices', { params: { fx } });
  return response.data;
};

export interface CryptoAlert {
  coinSymbol: string;
  wallet: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  signals: { type: string; dir: string; strength: number; detail: string }[];
  computedAt: string;
}

export const getCryptoAlerts = async () =>
  (await api.get<{ alerts: CryptoAlert[] }>('/crypto/alerts')).data.alerts;
