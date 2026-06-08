import Decimal from 'decimal.js';
import { and, asc, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { goldTransactions, portfolioSnapshots, stockTransactions } from '../../db/schema/index.js';
import { buildCsv } from '../../lib/csv.js';
import { getAssetSummaries } from '../dashboard/aggregator.js';

export class ReportError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const reportsService = {
  async pnlReport(userId: string, from?: Date, to?: Date) {
    const summaries = await getAssetSummaries(userId);
    const byAsset = summaries.map((summary) => ({
      assetClass: summary.assetClass,
      value: summary.value.toFixed(2),
      invested: summary.invested.toFixed(2),
      pnl: summary.pnl.toFixed(2),
      pnlPct: summary.invested.isZero() ? '0.00' : summary.pnl.div(summary.invested).mul(100).toFixed(2),
    }));

    const filters: SQL[] = [eq(portfolioSnapshots.userId, userId)];
    if (from) filters.push(gte(portfolioSnapshots.snapshotDate, from.toISOString().slice(0, 10)));
    if (to) filters.push(lte(portfolioSnapshots.snapshotDate, to.toISOString().slice(0, 10)));
    const snapshots = await db.select().from(portfolioSnapshots).where(and(...filters)).orderBy(asc(portfolioSnapshots.snapshotDate));
    const lastByMonth = new Map<string, string>();
    for (const snapshot of snapshots) lastByMonth.set(snapshot.snapshotDate.slice(0, 7), snapshot.totalValue);
    const months = [...lastByMonth.entries()];
    const byMonth = months.map(([month, aum], index) => {
      const previous = index > 0 ? months[index - 1]![1] : null;
      return { month, aum, delta: previous ? new Decimal(aum).minus(previous).toFixed(2) : '0.00' };
    });
    return { byAsset, byMonth };
  },

  async exportCsv(userId: string, module: 'gold' | 'stock', from?: Date, to?: Date): Promise<string> {
    if (module === 'gold') {
      const filters: SQL[] = [eq(goldTransactions.userId, userId)];
      if (from) filters.push(gte(goldTransactions.transactionAt, from));
      if (to) filters.push(lte(goldTransactions.transactionAt, to));
      const rows = await db.select().from(goldTransactions).where(and(...filters)).orderBy(desc(goldTransactions.transactionAt));
      return buildCsv(['Ngày', 'Loại vàng', 'Hành động', 'Số lượng', 'Đơn vị', 'Giá', 'Phí', 'Nơi lưu', 'Ghi chú'], rows.map((row) => [row.transactionAt.toISOString(), row.goldType, row.action, row.quantity, row.unit, row.pricePerUnit, row.fee, row.storage, row.note ?? '']));
    }
    const filters: SQL[] = [eq(stockTransactions.userId, userId)];
    if (from) filters.push(gte(stockTransactions.transactionAt, from));
    if (to) filters.push(lte(stockTransactions.transactionAt, to));
    const rows = await db.select().from(stockTransactions).where(and(...filters)).orderBy(desc(stockTransactions.transactionAt));
    return buildCsv(['Ngày', 'Mã', 'Sàn', 'Hành động', 'Số lượng', 'Giá', 'Phí', 'Thuế', 'Môi giới'], rows.map((row) => [row.transactionAt.toISOString(), row.symbol, row.exchange, row.action, row.quantity, row.price, row.brokerageFee, row.tax, row.broker ?? '']));
  },

  async snapshotOn(userId: string, date: string) {
    const [row] = await db.select().from(portfolioSnapshots).where(and(eq(portfolioSnapshots.userId, userId), lte(portfolioSnapshots.snapshotDate, date))).orderBy(desc(portfolioSnapshots.snapshotDate)).limit(1);
    if (!row) throw new ReportError(404, 'No snapshot on or before that date');
    return { snapshotDate: row.snapshotDate, totalValue: row.totalValue, totalInvested: row.totalInvested, pnl: row.pnl as Record<string, unknown> };
  },
};
