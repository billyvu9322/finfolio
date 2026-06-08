import { and, asc, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { goldTransactions, priceCache, type GoldTransaction } from '../../db/schema/index.js';
import { AuthError } from '../auth/auth.service.js';
import { calculateGoldPortfolio } from './gold.calc.js';
import type { GoldTransactionBody, GoldTransactionQuery } from './gold.schema.js';

const PRICE_STALE_MS = 15 * 60 * 1000;

function toPublic(tx: GoldTransaction) {
  return {
    id: tx.id,
    goldType: tx.goldType,
    action: tx.action,
    quantity: tx.quantity,
    unit: tx.unit,
    pricePerUnit: tx.pricePerUnit,
    fee: tx.fee,
    storage: tx.storage,
    note: tx.note,
    transactionAt: tx.transactionAt,
    createdAt: tx.createdAt,
  };
}

async function assertNoOversell(userId: string, replacement?: GoldTransaction): Promise<void> {
  const rows = await db.query.goldTransactions.findMany({
    where: eq(goldTransactions.userId, userId),
    orderBy: [asc(goldTransactions.transactionAt), asc(goldTransactions.createdAt)],
  });
  const transactions = replacement
    ? rows.map((row) => (row.id === replacement.id ? replacement : row))
    : rows;
  calculateGoldPortfolio(transactions, {});
}

export const goldService = {
  async listTransactions(userId: string, query: GoldTransactionQuery) {
    const filters: SQL[] = [eq(goldTransactions.userId, userId)];
    if (query.goldType) filters.push(eq(goldTransactions.goldType, query.goldType));
    if (query.action) filters.push(eq(goldTransactions.action, query.action));
    if (query.from) filters.push(gte(goldTransactions.transactionAt, query.from));
    if (query.to) filters.push(lte(goldTransactions.transactionAt, query.to));
    const where = and(...filters);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(goldTransactions)
        .where(where)
        .orderBy(desc(goldTransactions.transactionAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ value: count() }).from(goldTransactions).where(where),
    ]);
    return {
      data: rows.map(toPublic),
      pagination: { page: query.page, pageSize: query.pageSize, total: totalRows[0]?.value ?? 0 },
    };
  },

  async createTransaction(userId: string, input: GoldTransactionBody) {
    const [created] = await db
      .insert(goldTransactions)
      .values({ ...input, userId, transactionAt: input.transactionAt ?? new Date() })
      .returning();
    try {
      await assertNoOversell(userId);
    } catch (error) {
      await db.delete(goldTransactions).where(eq(goldTransactions.id, created!.id));
      throw new AuthError(400, (error as Error).message);
    }
    return toPublic(created!);
  },

  async updateTransaction(userId: string, id: string, input: GoldTransactionBody) {
    const existing = await db.query.goldTransactions.findFirst({
      where: and(eq(goldTransactions.id, id), eq(goldTransactions.userId, userId)),
    });
    if (!existing) throw new AuthError(404, 'Gold transaction not found');

    const replacement = { ...existing, ...input, transactionAt: input.transactionAt ?? existing.transactionAt };
    try {
      await assertNoOversell(userId, replacement);
    } catch (error) {
      throw new AuthError(400, (error as Error).message);
    }

    const [updated] = await db
      .update(goldTransactions)
      .set(input)
      .where(and(eq(goldTransactions.id, id), eq(goldTransactions.userId, userId)))
      .returning();
    return toPublic(updated!);
  },

  async deleteTransaction(userId: string, id: string) {
    await db.delete(goldTransactions).where(and(eq(goldTransactions.id, id), eq(goldTransactions.userId, userId)));
  },

  async getPortfolio(userId: string) {
    const [transactions, prices] = await Promise.all([
      db.query.goldTransactions.findMany({ where: eq(goldTransactions.userId, userId) }),
      db.query.priceCache.findMany({ where: eq(priceCache.assetType, 'gold') }),
    ]);
    const currentPrices = Object.fromEntries(
      prices.map((row) => [row.symbol, row.priceBuy ?? row.priceSell ?? '0']),
    );
    return calculateGoldPortfolio(transactions, currentPrices);
  },

  async getPrices() {
    const rows = await db.query.priceCache.findMany({ where: eq(priceCache.assetType, 'gold') });
    return {
      prices: rows.map((row) => ({
        symbol: row.symbol,
        priceBuy: row.priceBuy,
        priceSell: row.priceSell,
        currency: row.currency,
        source: row.source,
        fetchedAt: row.fetchedAt,
        stale: Date.now() - row.fetchedAt.getTime() > PRICE_STALE_MS,
      })),
      updatedAt: rows.reduce<Date | null>((latest, row) => {
        if (!latest || row.fetchedAt > latest) return row.fetchedAt;
        return latest;
      }, null),
    };
  },
};
