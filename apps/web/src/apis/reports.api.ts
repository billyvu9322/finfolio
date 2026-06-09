import { api } from '@/lib/api';

export interface PnlReport {
  byAsset: { assetClass: string; value: string; invested: string; pnl: string; pnlPct: string }[];
  byMonth: { month: string; aum: string; delta: string }[];
}

export interface SnapshotView {
  snapshotDate: string;
  totalValue: string;
  totalInvested: string;
  pnl: Record<string, unknown>;
}

export const getPnlReport = async (from?: string, to?: string) => (await api.get<PnlReport>('/reports/pnl', { params: { from, to } })).data;
export const getSnapshot = async (date: string) => (await api.get<SnapshotView>('/reports/snapshot', { params: { date } })).data;

export async function exportCsv(module: 'gold' | 'stock', from?: string, to?: string) {
  const response = await api.get('/reports/export/csv', { params: { module, from, to }, responseType: 'blob' });
  const url = URL.createObjectURL(response.data as Blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `finfolio-${module}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
