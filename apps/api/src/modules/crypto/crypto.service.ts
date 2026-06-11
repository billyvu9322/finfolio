import Decimal from 'decimal.js';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { cryptoTransactions, type CryptoTransaction } from '../../db/schema/index.js';
import { searchCoins } from './crypto.coins.js';
import { cryptoPriceService } from './crypto-price.service.js';
import { computeFeeVnd, computeHolding, heldQty, type CryptoTx, type FeeCurrency, unrealizedPnl } from './cryptoMath.js';
import type { CreateCryptoTxBody, ListCryptoTxQuery, SwapBody, UpdateCryptoTxBody } from './crypto.schema.js';
import { fetchUsdVndRate } from './market/FxRateProvider.js';
import { SeedCryptoDataProvider } from './market/SeedCryptoDataProvider.js';

const provider = new SeedCryptoDataProvider();

export class CryptoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function toEngineTx(transaction: CryptoTransaction): CryptoTx {
  const rate = transaction.usdVndRate ? Number(transaction.usdVndRate) : 25000;
  return {
    action: transaction.action === 'sell' ? 'sell' : 'buy',
    quantity: transaction.quantity,
    priceVnd: transaction.priceVnd,
    feeVnd: computeFeeVnd(transaction.fee, transaction.feeCurrency as FeeCurrency, transaction.priceVnd, rate).toString(),
    transactionAt: transaction.transactionAt,
  };
}

export const cryptoService = {
  coins(query: string) {
    return { coins: searchCoins(query) };
  },

  async list(userId: string, query: ListCryptoTxQuery) {
    const filters: SQL[] = [eq(cryptoTransactions.userId, userId)];
    if (query.coinSymbol) filters.push(eq(cryptoTransactions.coinSymbol, query.coinSymbol));
    if (query.wallet) filters.push(eq(cryptoTransactions.wallet, query.wallet));
    if (query.action) filters.push(eq(cryptoTransactions.action, query.action));
    if (query.from) filters.push(gte(cryptoTransactions.transactionAt, query.from));
    if (query.to) filters.push(lte(cryptoTransactions.transactionAt, query.to));
    const where = and(...filters);
    const [rows, totals] = await Promise.all([
      db.select().from(cryptoTransactions).where(where).orderBy(desc(cryptoTransactions.transactionAt)).limit(query.limit).offset((query.page - 1) * query.limit),
      db.select({ value: count() }).from(cryptoTransactions).where(where),
    ]);
    return { data: rows, pagination: { page: query.page, limit: query.limit, total: Number(totals[0]?.value ?? 0) } };
  },

  async create(userId: string, body: CreateCryptoTxBody): Promise<CryptoTransaction> {
    const rate = body.usdVndRate ?? (await fetchUsdVndRate());
    const priceVnd = body.priceCurrency === 'USDT' ? new Decimal(body.price).mul(rate) : new Decimal(body.price);
    const priceUsd = body.priceCurrency === 'USDT' ? new Decimal(body.price) : priceVnd.div(rate);
    const symbol = body.coinSymbol.toUpperCase();

    if (body.action === 'sell') {
      const existing = await db.select().from(cryptoTransactions).where(and(eq(cryptoTransactions.userId, userId), eq(cryptoTransactions.coinSymbol, symbol), eq(cryptoTransactions.wallet, body.wallet)));
      if (new Decimal(body.quantity).gt(heldQty(existing.map(toEngineTx)))) {
        throw new CryptoError(400, 'Sell exceeds holdings in this wallet');
      }
    }

    const [created] = await db.insert(cryptoTransactions).values({
      userId,
      coinId: body.coinId,
      coinSymbol: symbol,
      action: body.action,
      quantity: String(body.quantity),
      priceVnd: priceVnd.toFixed(2),
      priceUsd: priceUsd.toFixed(8),
      usdVndRate: String(rate),
      fee: String(body.fee),
      feeCurrency: body.feeCurrency,
      wallet: body.wallet,
      transactionAt: body.transactionAt ?? new Date(),
    }).returning();
    return created!;
  },

  async get(userId: string, id: string): Promise<CryptoTransaction> {
    const [row] = await db
      .select()
      .from(cryptoTransactions)
      .where(and(eq(cryptoTransactions.id, id), eq(cryptoTransactions.userId, userId)));
    if (!row) throw new CryptoError(404, 'Transaction not found');
    return row;
  },

  async update(userId: string, id: string, patch: UpdateCryptoTxBody): Promise<CryptoTransaction> {
    const set: Partial<typeof cryptoTransactions.$inferInsert> = {};
    if (patch.coinId !== undefined) set.coinId = patch.coinId;
    if (patch.coinSymbol !== undefined) set.coinSymbol = patch.coinSymbol.toUpperCase();
    if (patch.action !== undefined) set.action = patch.action;
    if (patch.quantity !== undefined) set.quantity = String(patch.quantity);
    if (patch.price !== undefined) set.priceVnd = String(patch.price);
    if (patch.priceCurrency !== undefined && patch.price !== undefined) {
      const rate = patch.usdVndRate ?? (await fetchUsdVndRate());
      const priceVnd = patch.priceCurrency === 'USDT' ? new Decimal(patch.price).mul(rate) : new Decimal(patch.price);
      set.priceVnd = priceVnd.toFixed(2);
      set.priceUsd = (patch.priceCurrency === 'USDT' ? new Decimal(patch.price) : priceVnd.div(rate)).toFixed(8);
      set.usdVndRate = String(rate);
    } else if (patch.usdVndRate !== undefined) {
      set.usdVndRate = String(patch.usdVndRate);
    }
    if (patch.fee !== undefined) set.fee = String(patch.fee);
    if (patch.feeCurrency !== undefined) set.feeCurrency = patch.feeCurrency;
    if (patch.wallet !== undefined) set.wallet = patch.wallet;
    if (patch.transactionAt !== undefined) set.transactionAt = patch.transactionAt;
    const [updated] = await db.update(cryptoTransactions).set(set).where(and(eq(cryptoTransactions.id, id), eq(cryptoTransactions.userId, userId))).returning();
    if (!updated) throw new CryptoError(404, 'Transaction not found');
    return updated;
  },

  async remove(userId: string, id: string): Promise<void> {
    const [deleted] = await db.delete(cryptoTransactions).where(and(eq(cryptoTransactions.id, id), eq(cryptoTransactions.userId, userId))).returning();
    if (!deleted) throw new CryptoError(404, 'Transaction not found');
  },

  async swap(userId: string, body: SwapBody): Promise<{ source: CryptoTransaction; dest: CryptoTransaction }> {
    const rate = await fetchUsdVndRate();
    const sourceSymbol = body.sourceSymbol.toUpperCase();
    const sellPriceVnd = new Decimal(body.valueVnd).div(body.sourceQty);
    const buyPriceVnd = new Decimal(body.valueVnd).div(body.destQty);

    return db.transaction(async (tx) => {
      const existing = await tx.select().from(cryptoTransactions).where(and(eq(cryptoTransactions.userId, userId), eq(cryptoTransactions.coinSymbol, sourceSymbol), eq(cryptoTransactions.wallet, body.wallet)));
      if (new Decimal(body.sourceQty).gt(heldQty(existing.map(toEngineTx)))) {
        throw new CryptoError(400, 'Swap source exceeds holdings in this wallet');
      }
      const transactionAt = body.transactionAt ?? new Date();
      const [source] = await tx.insert(cryptoTransactions).values({
        userId,
        coinId: body.sourceCoinId,
        coinSymbol: sourceSymbol,
        action: 'sell',
        quantity: String(body.sourceQty),
        priceVnd: sellPriceVnd.toFixed(2),
        priceUsd: sellPriceVnd.div(rate).toFixed(8),
        usdVndRate: String(rate),
        fee: '0',
        feeCurrency: 'VND',
        wallet: body.wallet,
        transactionAt,
      }).returning();
      const [dest] = await tx.insert(cryptoTransactions).values({
        userId,
        coinId: body.destCoinId,
        coinSymbol: body.destSymbol.toUpperCase(),
        action: 'buy',
        quantity: String(body.destQty),
        priceVnd: buyPriceVnd.toFixed(2),
        priceUsd: buyPriceVnd.div(rate).toFixed(8),
        usdVndRate: String(rate),
        fee: '0',
        feeCurrency: 'VND',
        wallet: body.wallet,
        transactionAt,
      }).returning();
      return { source: source!, dest: dest! };
    });
  },

  async portfolio(userId: string, fxOverride?: number) {
    const [transactions, quotes, providerRate, realQuotes] = await Promise.all([
      db.select().from(cryptoTransactions).where(eq(cryptoTransactions.userId, userId)),
      provider.fetchPrices(),
      fetchUsdVndRate(),
      cryptoPriceService.getQuotes(),
    ]);
    const fxRate = fxOverride ?? providerRate;
    // Seed prices as fallback; real Binance prices (crypto_prices) override per symbol.
    const quoteBySymbol = new Map<string, { priceUsd: string; priceVnd: string; change24hPct: string | null }>(
      quotes.map((quote) => [quote.symbol, { priceUsd: quote.priceUsd, priceVnd: quote.priceVnd, change24hPct: quote.change24hPct }]),
    );
    for (const [symbol, quote] of realQuotes) quoteBySymbol.set(symbol, quote);
    const groups = new Map<string, CryptoTransaction[]>();
    for (const transaction of transactions) {
      const key = `${transaction.coinSymbol}|${transaction.wallet}`;
      groups.set(key, [...(groups.get(key) ?? []), transaction]);
    }

    const holdings: Array<{ coinSymbol: string; wallet: string; qty: string; avgCostVnd: string; avgCostUsd: string; currentPriceVnd: string | null; currentPriceUsd: string | null; valueVnd: string | null; valueUsd: string | null; pnlVnd: string | null; pnlPct: string | null; change24hPct: string | null; weightPct: string | null }> = [];
    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const [key, rows] of groups.entries()) {
      const [coinSymbol, wallet] = key.split('|') as [string, string];
      const holding = computeHolding(rows.map(toEngineTx));
      if (holding.qty.isZero()) continue;
      const quote = quoteBySymbol.get(coinSymbol);
      const currentPrice = quote ? new Decimal(quote.priceVnd) : null;
      const value = currentPrice ? currentPrice.mul(holding.qty) : null;
      const pnl = currentPrice ? unrealizedPnl(holding.qty, holding.avgCostVnd, currentPrice) : null;
      totalInvested = totalInvested.plus(holding.investedVnd);
      if (value) totalValue = totalValue.plus(value);
      holdings.push({
        coinSymbol,
        wallet,
        qty: holding.qty.toString(),
        avgCostVnd: holding.avgCostVnd.toFixed(2),
        // USD-denominated unit prices: use the exchange's raw priceUsd (no VND
        // round-trip) so the portfolio matches the price card / history exactly.
        avgCostUsd: holding.avgCostVnd.div(fxRate).toFixed(8),
        currentPriceVnd: currentPrice?.toFixed(2) ?? null,
        currentPriceUsd: quote?.priceUsd ?? (currentPrice ? currentPrice.div(fxRate).toFixed(8) : null),
        valueVnd: value?.toFixed(2) ?? null,
        valueUsd: value?.div(fxRate).toFixed(2) ?? null,
        pnlVnd: pnl?.pnl.toFixed(2) ?? null,
        pnlPct: pnl?.pnlPct.toFixed(2) ?? null,
        change24hPct: quote?.change24hPct ?? null,
        weightPct: null,
      });
    }

    for (const holding of holdings) {
      holding.weightPct = holding.valueVnd && !totalValue.isZero() ? new Decimal(holding.valueVnd).div(totalValue).mul(100).toFixed(2) : null;
    }

    const totalPnl = totalValue.minus(totalInvested);
    return {
      holdings,
      totals: {
        valueVnd: totalValue.toFixed(2),
        valueUsd: totalValue.div(fxRate).toFixed(2),
        invested: totalInvested.toFixed(2),
        pnl: totalPnl.toFixed(2),
        pnlPct: totalInvested.isZero() ? '0.00' : totalPnl.div(totalInvested).mul(100).toFixed(2),
      },
      fxRate,
    };
  },

  async prices(fxOverride?: number) {
    const [quotes, providerRate] = await Promise.all([provider.fetchPrices(), fetchUsdVndRate()]);
    return { quotes, fxRate: fxOverride ?? providerRate };
  },
};
