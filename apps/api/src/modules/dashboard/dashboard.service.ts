import Decimal from 'decimal.js';
import { and, desc, eq, gte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { cryptoTransactions, goldTransactions, portfolioSnapshots, stockTransactions } from '../../db/schema/index.js';
import { getAssetSummaries, type AssetClass } from './aggregator.js';
import { computeBreakdown } from './breakdown.js';
import { computeTopMovers } from './top-movers.js';

const PERIOD_DAYS: Record<string, number | null> = { '7d': 7, '1m': 30, '3m': 90, '1y': 365, all: null };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const dashboardService = {
  async summary(userId: string) {
    const summaries = await getAssetSummaries(userId);
    const aum = summaries.reduce((sum, summary) => sum.plus(summary.value), new Decimal(0));
    const invested = summaries.reduce((sum, summary) => sum.plus(summary.invested), new Decimal(0));
    const pnl = summaries.reduce((sum, summary) => sum.plus(summary.pnl), new Decimal(0));
    const breakdown = computeBreakdown(summaries.map((summary) => ({ key: summary.assetClass, value: summary.value }))).map((item) => {
      const source = summaries.find((summary) => summary.assetClass === (item.key as AssetClass))!;
      return { assetClass: item.key, value: item.value, pct: item.pct, pnl: source.pnl.toFixed(2) };
    });
    return { aum: aum.toFixed(2), invested: invested.toFixed(2), pnl: pnl.toFixed(2), pnlPct: invested.isZero() ? '0.00' : pnl.div(invested).mul(100).toFixed(2), breakdown };
  },

  async growth(userId: string, period: string) {
    const days = PERIOD_DAYS[period] ?? null;
    const filters = [eq(portfolioSnapshots.userId, userId)];
    if (days !== null) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      filters.push(gte(portfolioSnapshots.snapshotDate, since.toISOString().slice(0, 10)));
    }
    const rows = await db.select().from(portfolioSnapshots).where(and(...filters)).orderBy(portfolioSnapshots.snapshotDate);
    if (rows.length === 0) {
      const summary = await this.summary(userId);
      return { data: [{ date: todayStr(), value: summary.aum }] };
    }
    return { data: rows.map((row) => ({ date: row.snapshotDate, value: row.totalValue })) };
  },

  async recentTransactions(userId: string, limit = 10) {
    const [gold, stock, crypto] = await Promise.all([
      db.select().from(goldTransactions).where(eq(goldTransactions.userId, userId)).orderBy(desc(goldTransactions.transactionAt)).limit(limit),
      db.select().from(stockTransactions).where(eq(stockTransactions.userId, userId)).orderBy(desc(stockTransactions.transactionAt)).limit(limit),
      db.select().from(cryptoTransactions).where(eq(cryptoTransactions.userId, userId)).orderBy(desc(cryptoTransactions.transactionAt)).limit(limit),
    ]);
    const items = [
      ...gold.map((transaction) => ({
        assetClass: 'gold' as AssetClass,
        title: transaction.goldType,
        subtitle: `${transaction.quantity} ${transaction.unit}`,
        action: transaction.action,
        amount: new Decimal(transaction.pricePerUnit).mul(transaction.quantity).mul(transaction.action === 'buy' ? -1 : 1).toFixed(2),
        date: transaction.transactionAt,
      })),
      ...stock.map((transaction) => ({
        assetClass: 'stock' as AssetClass,
        title: transaction.symbol,
        subtitle: `${transaction.quantity} CP`,
        action: transaction.action,
        amount: new Decimal(transaction.price).mul(transaction.quantity).mul(transaction.action === 'buy' ? -1 : 1).toFixed(2),
        date: transaction.transactionAt,
      })),
      ...crypto.map((transaction) => ({
        assetClass: 'crypto' as AssetClass,
        title: transaction.coinSymbol,
        subtitle: `${transaction.quantity} ${transaction.wallet}`,
        action: transaction.action,
        amount: new Decimal(transaction.priceVnd).mul(transaction.quantity).mul(transaction.action === 'buy' ? -1 : 1).toFixed(2),
        date: transaction.transactionAt,
      })),
    ];
    return { data: items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit).map((item) => ({ ...item, date: item.date.toISOString() })) };
  },

  async topHoldings(userId: string, limit = 5) {
    const summaries = await getAssetSummaries(userId);
    return {
      data: summaries
        .flatMap((summary) => summary.holdings)
        .filter((holding) => holding.value !== null)
        .sort((a, b) => b.value!.minus(a.value!).toNumber())
        .slice(0, limit)
        .map((holding) => ({ assetClass: holding.assetClass, label: holding.label, value: holding.value!.toFixed(2), pnlPct: holding.pnlPct?.toFixed(2) ?? null })),
    };
  },

  async topMovers(userId: string) {
    const summaries = await getAssetSummaries(userId);
    return computeTopMovers(summaries.flatMap((summary) => summary.holdings));
  },

  async createSnapshot(userId: string) {
    const summaries = await getAssetSummaries(userId);
    const totalValue = summaries.reduce((sum, summary) => sum.plus(summary.value), new Decimal(0));
    const totalInvested = summaries.reduce((sum, summary) => sum.plus(summary.invested), new Decimal(0));
    const pnl: Record<string, { value: string; invested: string; pnl: string }> = {};
    for (const summary of summaries) pnl[summary.assetClass] = { value: summary.value.toFixed(2), invested: summary.invested.toFixed(2), pnl: summary.pnl.toFixed(2) };
    const snapshotDate = todayStr();
    await db.insert(portfolioSnapshots).values({ userId, snapshotDate, totalValue: totalValue.toFixed(2), totalInvested: totalInvested.toFixed(2), pnl }).onConflictDoUpdate({
      target: [portfolioSnapshots.userId, portfolioSnapshots.snapshotDate],
      set: { totalValue: totalValue.toFixed(2), totalInvested: totalInvested.toFixed(2), pnl },
    });
    return { snapshotDate };
  },
};
