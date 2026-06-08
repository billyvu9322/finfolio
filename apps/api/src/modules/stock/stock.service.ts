import Decimal from 'decimal.js';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { priceCache, stockTransactions, type StockTransaction } from '../../db/schema/index.js';
import { SeedMarketDataProvider } from './market/SeedMarketDataProvider.js';
import { computeHolding, computeStockFees, heldQty, unrealizedPnl, type StockTx } from './stockMath.js';
import type { CreateStockTxBody, ListStockTxQuery, UpdateStockTxBody } from './stock.schema.js';
import { findSymbol } from './stock.symbols.js';

const STALE_MS = 5 * 60 * 1000;
const provider = new SeedMarketDataProvider();

export class StockError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function toEngineTx(transaction: StockTransaction): StockTx {
  return {
    action: transaction.action,
    quantity: transaction.quantity,
    price: transaction.price,
    brokerageFee: transaction.brokerageFee,
    tax: transaction.tax,
    transactionAt: transaction.transactionAt,
  };
}

export const stockService = {
  async list(userId: string, query: ListStockTxQuery) {
    const filters: SQL[] = [eq(stockTransactions.userId, userId)];
    if (query.symbol) filters.push(eq(stockTransactions.symbol, query.symbol));
    if (query.action) filters.push(eq(stockTransactions.action, query.action));
    if (query.from) filters.push(gte(stockTransactions.transactionAt, query.from));
    if (query.to) filters.push(lte(stockTransactions.transactionAt, query.to));
    const where = and(...filters);
    const [rows, totals] = await Promise.all([
      db.select().from(stockTransactions).where(where).orderBy(desc(stockTransactions.transactionAt)).limit(query.limit).offset((query.page - 1) * query.limit),
      db.select({ value: count() }).from(stockTransactions).where(where),
    ]);
    return { data: rows, pagination: { page: query.page, limit: query.limit, total: totals[0]?.value ?? 0 } };
  },

  async create(userId: string, body: CreateStockTxBody): Promise<StockTransaction> {
    const symbol = body.symbol.toUpperCase();
    const exchange = body.exchange ?? findSymbol(symbol)?.exchange ?? 'HOSE';
    if ((body.action === 'buy' || body.action === 'sell') && exchange === 'HOSE' && body.quantity % 100 !== 0) {
      throw new StockError(400, 'HOSE quantity must be a multiple of 100');
    }
    if (body.action === 'sell') {
      const existing = await db.query.stockTransactions.findMany({ where: and(eq(stockTransactions.userId, userId), eq(stockTransactions.symbol, symbol)) });
      if (new Decimal(body.quantity).gt(heldQty(existing.map(toEngineTx)))) {
        throw new StockError(400, 'Sell exceeds current holdings');
      }
    }
    const fees = computeStockFees(body.action, body.quantity, body.price);
    const [created] = await db.insert(stockTransactions).values({
      userId,
      symbol,
      exchange,
      action: body.action,
      quantity: body.quantity,
      price: String(body.price),
      brokerageFee: String(body.brokerageFee ?? fees.brokerageFee),
      tax: String(body.tax ?? fees.tax),
      broker: body.broker,
      transactionAt: body.transactionAt ?? new Date(),
    }).returning();
    return created!;
  },

  async update(userId: string, id: string, patch: UpdateStockTxBody): Promise<StockTransaction> {
    const set: Partial<typeof stockTransactions.$inferInsert> = {};
    if (patch.symbol !== undefined) set.symbol = patch.symbol.toUpperCase();
    if (patch.exchange !== undefined) set.exchange = patch.exchange;
    if (patch.action !== undefined) set.action = patch.action;
    if (patch.quantity !== undefined) set.quantity = patch.quantity;
    if (patch.price !== undefined) set.price = String(patch.price);
    if (patch.brokerageFee !== undefined) set.brokerageFee = String(patch.brokerageFee);
    if (patch.tax !== undefined) set.tax = String(patch.tax);
    if (patch.broker !== undefined) set.broker = patch.broker;
    if (patch.transactionAt !== undefined) set.transactionAt = patch.transactionAt;
    const [updated] = await db.update(stockTransactions).set(set).where(and(eq(stockTransactions.id, id), eq(stockTransactions.userId, userId))).returning();
    if (!updated) throw new StockError(404, 'Transaction not found');
    return updated;
  },

  async remove(userId: string, id: string): Promise<void> {
    const [deleted] = await db.delete(stockTransactions).where(and(eq(stockTransactions.id, id), eq(stockTransactions.userId, userId))).returning();
    if (!deleted) throw new StockError(404, 'Transaction not found');
  },

  async portfolio(userId: string) {
    const [transactions, prices] = await Promise.all([
      db.query.stockTransactions.findMany({ where: eq(stockTransactions.userId, userId) }),
      db.query.priceCache.findMany({ where: eq(priceCache.assetType, 'stock') }),
    ]);
    const pricesBySymbol = new Map(prices.map((row) => [row.symbol, row]));
    const bySymbol = new Map<string, StockTransaction[]>();
    for (const transaction of transactions) bySymbol.set(transaction.symbol, [...(bySymbol.get(transaction.symbol) ?? []), transaction]);

    const holdings: Array<{ symbol: string; exchange: StockTransaction['exchange']; qty: string; avgCost: string; currentPrice: string | null; value: string | null; weightPct: string | null; pnl: string | null; pnlPct: string | null; dividendIncome: string }> = [];
    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);
    let totalDividendIncome = new Decimal(0);
    for (const [symbol, rows] of bySymbol.entries()) {
      const holding = computeHolding(rows.map(toEngineTx));
      totalDividendIncome = totalDividendIncome.plus(holding.dividendIncome);
      if (holding.qty.isZero() && holding.dividendIncome.isZero()) continue;
      const current = pricesBySymbol.get(symbol)?.priceBuy ? new Decimal(pricesBySymbol.get(symbol)!.priceBuy!) : null;
      const value = current ? current.mul(holding.qty) : null;
      const pnl = current ? unrealizedPnl(holding.qty, holding.avgCost, current) : null;
      totalInvested = totalInvested.plus(holding.investedRemaining);
      if (value) totalValue = totalValue.plus(value);
      holdings.push({ symbol, exchange: rows[0]!.exchange, qty: holding.qty.toString(), avgCost: holding.avgCost.toFixed(2), currentPrice: current?.toFixed(2) ?? null, value: value?.toFixed(2) ?? null, weightPct: null, pnl: pnl?.pnl.toFixed(2) ?? null, pnlPct: pnl?.pnlPct.toFixed(2) ?? null, dividendIncome: holding.dividendIncome.toFixed(2) });
    }
    for (const holding of holdings) holding.weightPct = holding.value && !totalValue.isZero() ? new Decimal(holding.value).div(totalValue).mul(100).toFixed(2) : null;
    const totalPnl = totalValue.minus(totalInvested);
    return { holdings, totals: { value: totalValue.toFixed(2), invested: totalInvested.toFixed(2), pnl: totalPnl.toFixed(2), pnlPct: totalInvested.isZero() ? '0.00' : totalPnl.div(totalInvested).mul(100).toFixed(2), dividendIncome: totalDividendIncome.toFixed(2) } };
  },

  async prices() {
    const rows = await db.query.priceCache.findMany({ where: eq(priceCache.assetType, 'stock') });
    const updatedAt = rows.reduce<Date | null>((latest, row) => (!latest || row.fetchedAt > latest ? row.fetchedAt : latest), null);
    return { prices: rows.map((row) => ({ symbol: row.symbol, source: row.source, price: row.priceBuy, currency: row.currency, fetchedAt: row.fetchedAt })), updatedAt, stale: !updatedAt || Date.now() - updatedAt.getTime() > STALE_MS };
  },

  async ohlc(userId: string, symbol: string, range: '1m' | '3m' | '6m') {
    const normalized = symbol.toUpperCase();
    const [candles, trades] = await Promise.all([
      provider.fetchOhlc(normalized, range),
      db.query.stockTransactions.findMany({ where: and(eq(stockTransactions.userId, userId), eq(stockTransactions.symbol, normalized)) }),
    ]);
    return { candles, markers: trades.filter((trade) => trade.action === 'buy' || trade.action === 'sell').map((trade) => ({ time: trade.transactionAt.toISOString().slice(0, 10), action: trade.action, price: trade.price })) };
  },
};
