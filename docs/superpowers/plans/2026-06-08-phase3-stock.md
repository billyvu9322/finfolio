# Phase 3 — Stock Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **NO GIT this build.** Where a normal plan would `git commit`, use the **Checkpoint** step (typecheck/test). Never run git.

**Goal:** Implement the Stock module — transaction CRUD (incl. dividends) with a WAVG cost + fee/tax + unrealized-P&L engine, a seed market-data source (symbols, prices, synthetic OHLC) with scheduled refresh, and the `/stocks` portfolio, `/stocks/add`, and `/stocks/$symbol` candlestick screens.

**Architecture:** Pure `stockMath` (decimal.js) does WAVG + dividend handling + fees + P&L; `stock.service` wraps it with Drizzle, exchange resolution, the HOSE lot rule and sell-guard. A `MarketDataProvider` interface with a seed impl feeds `price_cache (asset_type='stock')` via the (extended) scheduler and a manual refresh endpoint, and supplies synthetic OHLC. Web uses a typed client + TanStack Query + lightweight-charts.

**Tech Stack:** Fastify 5, Drizzle, Zod, decimal.js, node-cron, vitest (API). React 18, TanStack Router/Query, axios, lightweight-charts (Web). Runtime `tsx`.

**Spec:** [../specs/2026-06-08-phase3-stock-design.md](../specs/2026-06-08-phase3-stock-design.md)

**Reference facts:**
- `stock_transactions` columns: `id, userId, symbol, exchange('HOSE'|'HNX'|'UPCOM'), action('buy'|'sell'|'cash_dividend'|'stock_dividend'), quantity(int), price, brokerageFee, tax, broker, transactionAt, createdAt`.
- `price_cache`: `assetType, symbol, priceBuy, priceSell, currency, source, fetchedAt`; unique `(assetType, symbol)`.
- Phase 2 already added `decimal.js`, `node-cron`, `ENABLE_PRICE_SCHEDULER`, and `plugins/scheduler.ts` (gold). This plan extends the scheduler.
- Fee defaults: buy/sell brokerage 0.15%; sell tax 0.1%. HOSE lot = multiple of 100, min 100.

---

## Task 1: Web dependency (lightweight-charts)

**Files:**
- Modify: `apps/web/package.json`

- [x] **Step 1: Add dep**

In `apps/web/package.json` `dependencies` add: `"lightweight-charts": "^4.2.0"`.

- [x] **Step 2: Install**

Run: `pnpm install`
Expected: no errors.

- [x] **Step 3: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 2: `stockMath` engine (TDD)

**Files:**
- Create: `apps/api/src/modules/stock/stockMath.ts`
- Create: `apps/api/src/modules/stock/stockMath.test.ts`

- [x] **Step 1: Write the failing tests**

Create `apps/api/src/modules/stock/stockMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  computeHolding,
  computeStockFees,
  unrealizedPnl,
  type StockTx,
} from './stockMath.js';

const tx = (p: Partial<StockTx>): StockTx => ({
  action: 'buy',
  quantity: 100,
  price: '20000',
  brokerageFee: '0',
  tax: '0',
  transactionAt: new Date('2026-01-01T00:00:00Z'),
  ...p,
});

describe('computeStockFees', () => {
  it('buy: 0.15% brokerage, no tax', () => {
    const f = computeStockFees('buy', 100, '20000');
    expect(f.brokerageFee.toString()).toBe('3000'); // 0.0015 * 2,000,000
    expect(f.tax.toString()).toBe('0');
  });
  it('sell: 0.15% brokerage + 0.1% tax', () => {
    const f = computeStockFees('sell', 100, '20000');
    expect(f.brokerageFee.toString()).toBe('3000');
    expect(f.tax.toString()).toBe('2000'); // 0.001 * 2,000,000
  });
  it('dividend: zero fees', () => {
    const f = computeStockFees('cash_dividend', 100, '1000');
    expect(f.brokerageFee.toString()).toBe('0');
    expect(f.tax.toString()).toBe('0');
  });
});

describe('computeHolding', () => {
  it('single buy folds fees into cost', () => {
    const h = computeHolding([tx({ quantity: 100, price: '20000', brokerageFee: '3000' })]);
    expect(h.qty.toString()).toBe('100');
    // (100*20000 + 3000)/100 = 20030
    expect(h.avgCost.toString()).toBe('20030');
  });

  it('two buys → weighted average', () => {
    const h = computeHolding([
      tx({ quantity: 100, price: '20000', transactionAt: new Date('2026-01-01') }),
      tx({ quantity: 100, price: '30000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('200');
    expect(h.avgCost.toString()).toBe('25000');
  });

  it('sell reduces qty, avg unchanged', () => {
    const h = computeHolding([
      tx({ quantity: 200, price: '25000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'sell', quantity: 50, price: '30000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('150');
    expect(h.avgCost.toString()).toBe('25000');
  });

  it('stock dividend raises qty and lowers avg cost', () => {
    const h = computeHolding([
      tx({ quantity: 100, price: '20000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'stock_dividend', quantity: 100, price: '0', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('200');
    expect(h.avgCost.toString()).toBe('10000'); // 2,000,000 / 200
  });

  it('cash dividend adds income only', () => {
    const h = computeHolding([
      tx({ quantity: 100, price: '20000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'cash_dividend', quantity: 100, price: '1500', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('100');
    expect(h.avgCost.toString()).toBe('20000');
    expect(h.dividendIncome.toString()).toBe('150000');
  });

  it('full sell → qty 0, avg 0', () => {
    const h = computeHolding([
      tx({ quantity: 100, price: '20000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'sell', quantity: 100, price: '25000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('0');
    expect(h.avgCost.toString()).toBe('0');
  });
});

describe('unrealizedPnl', () => {
  it('gain', () => {
    const r = unrealizedPnl(200, '25000', '30000');
    expect(r.pnl.toString()).toBe('1000000'); // (30000-25000)*200
    expect(r.pnlPct.toString()).toBe('20');
  });
  it('zero qty', () => {
    const r = unrealizedPnl(0, '0', '30000');
    expect(r.pnl.toString()).toBe('0');
    expect(r.pnlPct.toString()).toBe('0');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm --filter @finfolio/api test stockMath`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the engine**

Create `apps/api/src/modules/stock/stockMath.ts`:
```ts
import Decimal from 'decimal.js';

export type StockAction = 'buy' | 'sell' | 'cash_dividend' | 'stock_dividend';

export interface StockTx {
  action: StockAction;
  quantity: number;
  price: string | number;
  brokerageFee: string | number;
  tax: string | number;
  transactionAt: Date;
}

export interface StockHolding {
  qty: Decimal;
  avgCost: Decimal;
  investedRemaining: Decimal;
  dividendIncome: Decimal;
}

export const FEE_RATES = { buyBrokerage: 0.0015, sellBrokerage: 0.0015, sellTax: 0.001 };

export function computeStockFees(
  action: StockAction,
  quantity: number,
  price: string | number,
  rates = FEE_RATES,
): { brokerageFee: Decimal; tax: Decimal } {
  const value = new Decimal(price).mul(quantity);
  if (action === 'buy') {
    return { brokerageFee: value.mul(rates.buyBrokerage), tax: new Decimal(0) };
  }
  if (action === 'sell') {
    return { brokerageFee: value.mul(rates.sellBrokerage), tax: value.mul(rates.sellTax) };
  }
  return { brokerageFee: new Decimal(0), tax: new Decimal(0) };
}

/** Running average-cost. Sells keep avg cost; stock dividends add shares at 0 cost. */
export function computeHolding(txs: StockTx[]): StockHolding {
  const ordered = [...txs].sort((a, b) => a.transactionAt.getTime() - b.transactionAt.getTime());
  let qty = new Decimal(0);
  let cost = new Decimal(0);
  let dividendIncome = new Decimal(0);

  for (const t of ordered) {
    const q = new Decimal(t.quantity);
    if (t.action === 'buy') {
      qty = qty.plus(q);
      cost = cost.plus(new Decimal(t.price).mul(q)).plus(t.brokerageFee).plus(t.tax);
    } else if (t.action === 'stock_dividend') {
      qty = qty.plus(q);
    } else if (t.action === 'sell') {
      const avg = qty.isZero() ? new Decimal(0) : cost.div(qty);
      cost = cost.minus(avg.mul(q));
      qty = qty.minus(q);
      if (qty.lt(0)) qty = new Decimal(0);
      if (cost.lt(0)) cost = new Decimal(0);
    } else if (t.action === 'cash_dividend') {
      dividendIncome = dividendIncome.plus(new Decimal(t.price).mul(q));
    }
  }

  const avgCost = qty.isZero() ? new Decimal(0) : cost.div(qty);
  return { qty, avgCost, investedRemaining: cost, dividendIncome };
}

export function heldQty(txs: StockTx[]): Decimal {
  return computeHolding(txs).qty;
}

export function unrealizedPnl(
  qty: number | Decimal,
  avgCost: string | number | Decimal,
  currentPrice: string | number | Decimal,
): { pnl: Decimal; pnlPct: Decimal } {
  const q = new Decimal(qty);
  const avg = new Decimal(avgCost);
  const cur = new Decimal(currentPrice);
  const pnl = cur.minus(avg).mul(q);
  const basis = avg.mul(q);
  const pnlPct = basis.isZero() ? new Decimal(0) : pnl.div(basis).mul(100);
  return { pnl, pnlPct };
}
```

- [x] **Step 4: Run to verify it passes**

Run: `pnpm --filter @finfolio/api test stockMath`
Expected: all passed.

- [x] **Step 5: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
Expected: clean + green.

---

## Task 3: Symbol master (TDD)

**Files:**
- Create: `apps/api/src/modules/stock/stock.symbols.ts`
- Create: `apps/api/src/modules/stock/stock.symbols.test.ts`

- [x] **Step 1: Write the failing tests**

Create `apps/api/src/modules/stock/stock.symbols.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findSymbol, searchSymbols } from './stock.symbols.js';

describe('findSymbol', () => {
  it('finds a known symbol case-insensitively', () => {
    expect(findSymbol('fpt')?.exchange).toBe('HOSE');
  });
  it('returns undefined for unknown', () => {
    expect(findSymbol('ZZZZ')).toBeUndefined();
  });
});

describe('searchSymbols', () => {
  it('prefix-matches and limits', () => {
    const r = searchSymbols('F', 5);
    expect(r.length).toBeLessThanOrEqual(5);
    expect(r.some((s) => s.symbol === 'FPT')).toBe(true);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm --filter @finfolio/api test stock.symbols`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the master**

Create `apps/api/src/modules/stock/stock.symbols.ts`:
```ts
export type Exchange = 'HOSE' | 'HNX' | 'UPCOM';
export interface SymbolEntry {
  symbol: string;
  exchange: Exchange;
  name: string;
}

export const STOCK_SYMBOLS: SymbolEntry[] = [
  { symbol: 'FPT', exchange: 'HOSE', name: 'FPT Corporation' },
  { symbol: 'MWG', exchange: 'HOSE', name: 'Thế Giới Di Động' },
  { symbol: 'VNM', exchange: 'HOSE', name: 'Vinamilk' },
  { symbol: 'HPG', exchange: 'HOSE', name: 'Hòa Phát' },
  { symbol: 'VCB', exchange: 'HOSE', name: 'Vietcombank' },
  { symbol: 'VIC', exchange: 'HOSE', name: 'Vingroup' },
  { symbol: 'VHM', exchange: 'HOSE', name: 'Vinhomes' },
  { symbol: 'MSN', exchange: 'HOSE', name: 'Masan Group' },
  { symbol: 'TCB', exchange: 'HOSE', name: 'Techcombank' },
  { symbol: 'ACB', exchange: 'HOSE', name: 'Á Châu Bank' },
  { symbol: 'SSI', exchange: 'HOSE', name: 'SSI Securities' },
  { symbol: 'VND', exchange: 'HOSE', name: 'VNDirect' },
  { symbol: 'GAS', exchange: 'HOSE', name: 'PV Gas' },
  { symbol: 'SHS', exchange: 'HNX', name: 'Sài Gòn - Hà Nội Securities' },
  { symbol: 'PVS', exchange: 'HNX', name: 'PTSC' },
  { symbol: 'CEO', exchange: 'HNX', name: 'C.E.O Group' },
  { symbol: 'IDC', exchange: 'HNX', name: 'IDICO' },
  { symbol: 'BSR', exchange: 'UPCOM', name: 'Bình Sơn Refining' },
  { symbol: 'OIL', exchange: 'UPCOM', name: 'PV Oil' },
  { symbol: 'VGT', exchange: 'UPCOM', name: 'Vinatex' },
];

export function findSymbol(code: string): SymbolEntry | undefined {
  const up = code.toUpperCase();
  return STOCK_SYMBOLS.find((s) => s.symbol === up);
}

export function searchSymbols(q: string, limit = 10): SymbolEntry[] {
  const up = q.trim().toUpperCase();
  if (!up) return STOCK_SYMBOLS.slice(0, limit);
  return STOCK_SYMBOLS.filter(
    (s) => s.symbol.startsWith(up) || s.name.toUpperCase().includes(up),
  ).slice(0, limit);
}
```

- [x] **Step 4: Run to verify it passes**

Run: `pnpm --filter @finfolio/api test stock.symbols`
Expected: all passed.

- [x] **Step 5: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 4: `stock.schema.ts` (Zod) + tests

**Files:**
- Create: `apps/api/src/modules/stock/stock.schema.ts`
- Create: `apps/api/src/modules/stock/stock.schema.test.ts`

- [x] **Step 1: Write the failing tests**

Create `apps/api/src/modules/stock/stock.schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createStockTxSchema, updateStockTxSchema, ohlcQuerySchema } from './stock.schema.js';

const valid = { symbol: 'fpt', action: 'buy', quantity: 100, price: 90000 };

describe('createStockTxSchema', () => {
  it('accepts valid and uppercases symbol', () => {
    const r = createStockTxSchema.parse(valid);
    expect(r.symbol).toBe('FPT');
  });
  it('rejects non-integer quantity', () => {
    expect(createStockTxSchema.safeParse({ ...valid, quantity: 1.5 }).success).toBe(false);
  });
  it('rejects quantity <= 0', () => {
    expect(createStockTxSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false);
  });
  it('rejects bad action', () => {
    expect(createStockTxSchema.safeParse({ ...valid, action: 'x' }).success).toBe(false);
  });
});

describe('updateStockTxSchema', () => {
  it('rejects empty', () => expect(updateStockTxSchema.safeParse({}).success).toBe(false));
});

describe('ohlcQuerySchema', () => {
  it('defaults range to 3m', () => expect(ohlcQuerySchema.parse({}).range).toBe('3m'));
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm --filter @finfolio/api test stock.schema`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the schemas**

Create `apps/api/src/modules/stock/stock.schema.ts`:
```ts
import { z } from 'zod';

export const exchangeSchema = z.enum(['HOSE', 'HNX', 'UPCOM']);
export const stockActionSchema = z.enum(['buy', 'sell', 'cash_dividend', 'stock_dividend']);

export const createStockTxSchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  exchange: exchangeSchema.optional(),
  action: stockActionSchema,
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
  brokerageFee: z.coerce.number().nonnegative().optional(),
  tax: z.coerce.number().nonnegative().optional(),
  broker: z.string().max(80).optional(),
  transactionAt: z.coerce.date().optional(),
});

export const updateStockTxSchema = createStockTxSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'At least one field is required',
  });

export const listStockTxQuerySchema = z.object({
  symbol: z.string().optional(),
  action: stockActionSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ohlcQuerySchema = z.object({
  range: z.enum(['1m', '3m', '6m']).default('3m'),
});

// ---- responses ----
export const stockTxSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  exchange: exchangeSchema,
  action: stockActionSchema,
  quantity: z.number(),
  price: z.string(),
  brokerageFee: z.string(),
  tax: z.string(),
  broker: z.string().nullable(),
  transactionAt: z.date(),
  createdAt: z.date(),
});

export const stockHoldingSchema = z.object({
  symbol: z.string(),
  exchange: exchangeSchema,
  qty: z.string(),
  avgCost: z.string(),
  currentPrice: z.string().nullable(),
  value: z.string().nullable(),
  weightPct: z.string().nullable(),
  pnl: z.string().nullable(),
  pnlPct: z.string().nullable(),
  dividendIncome: z.string(),
});

export const stockPortfolioSchema = z.object({
  holdings: z.array(stockHoldingSchema),
  totals: z.object({
    value: z.string(),
    invested: z.string(),
    pnl: z.string(),
    pnlPct: z.string(),
    dividendIncome: z.string(),
  }),
});

export const stockPriceSchema = z.object({
  symbol: z.string(),
  source: z.string(),
  price: z.string().nullable(),
  currency: z.string(),
  fetchedAt: z.date(),
});
export const stockPricesSchema = z.object({
  prices: z.array(stockPriceSchema),
  updatedAt: z.date().nullable(),
  stale: z.boolean(),
});

export const candleSchema = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});
export const ohlcSchema = z.object({
  candles: z.array(candleSchema),
  markers: z.array(
    z.object({ time: z.string(), action: stockActionSchema, price: z.string() }),
  ),
});

export const symbolSchema = z.object({
  symbol: z.string(),
  exchange: exchangeSchema,
  name: z.string(),
});

export type CreateStockTxBody = z.infer<typeof createStockTxSchema>;
export type UpdateStockTxBody = z.infer<typeof updateStockTxSchema>;
export type ListStockTxQuery = z.infer<typeof listStockTxQuerySchema>;
```

- [x] **Step 4: Run to verify it passes**

Run: `pnpm --filter @finfolio/api test stock.schema`
Expected: all passed.

- [x] **Step 5: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 5: Market data provider + refresh

**Files:**
- Create: `apps/api/src/modules/stock/market/MarketDataProvider.ts`
- Create: `apps/api/src/modules/stock/market/SeedMarketDataProvider.ts`
- Create: `apps/api/src/modules/stock/market/refreshStockPrices.ts`

- [x] **Step 1: Interface**

Create `apps/api/src/modules/stock/market/MarketDataProvider.ts`:
```ts
export interface StockQuote {
  symbol: string;
  price: string; // VND per share
  currency: 'VND';
  source: string;
}

export interface Candle {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketDataProvider {
  fetchStockPrices(): Promise<StockQuote[]>;
  fetchOhlc(symbol: string, range: '1m' | '3m' | '6m'): Promise<Candle[]>;
}
```

- [x] **Step 2: Seed provider (deterministic synthetic data)**

Create `apps/api/src/modules/stock/market/SeedMarketDataProvider.ts`:
```ts
import { STOCK_SYMBOLS } from '../stock.symbols.js';
import type { Candle, MarketDataProvider, StockQuote } from './MarketDataProvider.js';

// Stable base price per symbol (deterministic from the symbol code).
function basePrice(symbol: string): number {
  const seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  return 20000 + (seed % 80) * 1000; // 20k..100k VND
}

const RANGE_DAYS = { '1m': 30, '3m': 90, '6m': 180 } as const;

export class SeedMarketDataProvider implements MarketDataProvider {
  async fetchStockPrices(): Promise<StockQuote[]> {
    return STOCK_SYMBOLS.map((s) => ({
      symbol: s.symbol,
      price: String(basePrice(s.symbol)),
      currency: 'VND',
      source: 'seed',
    }));
  }

  async fetchOhlc(symbol: string, range: '1m' | '3m' | '6m'): Promise<Candle[]> {
    const days = RANGE_DAYS[range];
    const base = basePrice(symbol);
    const candles: Candle[] = [];
    let prev = base;
    // Deterministic pseudo-random walk seeded by symbol + index.
    let seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 7);
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280; // 0..1
    };
    const start = new Date();
    start.setDate(start.getDate() - days);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const open = prev;
      const drift = (rand() - 0.5) * 0.04 * base; // ±2%
      const close = Math.max(1000, Math.round(open + drift));
      const high = Math.max(open, close) + Math.round(rand() * 0.01 * base);
      const low = Math.min(open, close) - Math.round(rand() * 0.01 * base);
      candles.push({ time: d.toISOString().slice(0, 10), open, high, low, close });
      prev = close;
    }
    return candles;
  }
}
```

- [x] **Step 3: Refresh (upsert prices)**

Create `apps/api/src/modules/stock/market/refreshStockPrices.ts`:
```ts
import { db } from '../../../db/index.js';
import { priceCache } from '../../../db/schema/index.js';
import type { MarketDataProvider } from './MarketDataProvider.js';

export async function refreshStockPrices(provider: MarketDataProvider): Promise<number> {
  const quotes = await provider.fetchStockPrices();
  const now = new Date();
  for (const q of quotes) {
    await db
      .insert(priceCache)
      .values({
        assetType: 'stock',
        symbol: q.symbol,
        priceBuy: q.price,
        priceSell: q.price,
        currency: q.currency,
        source: q.source,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: [priceCache.assetType, priceCache.symbol],
        set: { priceBuy: q.price, priceSell: q.price, source: q.source, fetchedAt: now },
      });
  }
  return quotes.length;
}
```

- [x] **Step 4: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 6: Extend scheduler with stock refresh

**Files:**
- Modify: `apps/api/src/plugins/scheduler.ts`

- [x] **Step 1: Add the stock cron**

In `apps/api/src/plugins/scheduler.ts`:
- Add imports:
```ts
import { SeedMarketDataProvider } from '../modules/stock/market/SeedMarketDataProvider.js';
import { refreshStockPrices } from '../modules/stock/market/refreshStockPrices.js';
```
- Inside the plugin, after the gold task is scheduled (still within the `if (env.ENABLE_PRICE_SCHEDULER)` block), add:
```ts
  const stockProvider = new SeedMarketDataProvider();
  const stockTask = cron.schedule('*/5 * * * *', () => {
    refreshStockPrices(stockProvider)
      .then((n) => fastify.log.info(`Stock prices refreshed: ${n}`))
      .catch((err) => fastify.log.error(err, 'Stock price refresh failed'));
  });
  fastify.addHook('onClose', async () => stockTask.stop());
```

- [x] **Step 2: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 7: `stock.service.ts`

**Files:**
- Create: `apps/api/src/modules/stock/stock.service.ts`

- [x] **Step 1: Implement the service**

Create `apps/api/src/modules/stock/stock.service.ts`:
```ts
import Decimal from 'decimal.js';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { priceCache, stockTransactions, type StockTransaction } from '../../db/schema/index.js';
import { SeedMarketDataProvider } from './market/SeedMarketDataProvider.js';
import {
  computeHolding,
  computeStockFees,
  heldQty,
  unrealizedPnl,
  type StockTx,
} from './stockMath.js';
import { findSymbol } from './stock.symbols.js';
import type { CreateStockTxBody, ListStockTxQuery, UpdateStockTxBody } from './stock.schema.js';

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

function toEngineTx(t: StockTransaction): StockTx {
  return {
    action: t.action,
    quantity: t.quantity,
    price: t.price,
    brokerageFee: t.brokerageFee,
    tax: t.tax,
    transactionAt: t.transactionAt,
  };
}

export const stockService = {
  async list(userId: string, q: ListStockTxQuery) {
    const conds = [eq(stockTransactions.userId, userId)];
    if (q.symbol) conds.push(eq(stockTransactions.symbol, q.symbol.toUpperCase()));
    if (q.action) conds.push(eq(stockTransactions.action, q.action));
    if (q.from) conds.push(gte(stockTransactions.transactionAt, q.from));
    if (q.to) conds.push(lte(stockTransactions.transactionAt, q.to));
    const where = and(...conds);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(stockTransactions)
        .where(where)
        .orderBy(desc(stockTransactions.transactionAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db.select({ value: count() }).from(stockTransactions).where(where),
    ]);
    return { data: rows, pagination: { page: q.page, limit: q.limit, total: Number(total) } };
  },

  async create(userId: string, body: CreateStockTxBody): Promise<StockTransaction> {
    const symbol = body.symbol.toUpperCase();
    const exchange = body.exchange ?? findSymbol(symbol)?.exchange ?? 'HOSE';

    // Lot rule (FR-STOCK-04)
    if (exchange === 'HOSE' && (body.action === 'buy' || body.action === 'sell')) {
      if (body.quantity % 100 !== 0) {
        throw new StockError(400, 'HOSE quantity must be a multiple of 100');
      }
    }

    // Fees: auto-compute when not provided.
    const fees = computeStockFees(body.action, body.quantity, body.price);
    const brokerageFee = body.brokerageFee !== undefined ? body.brokerageFee : Number(fees.brokerageFee);
    const tax = body.tax !== undefined ? body.tax : Number(fees.tax);

    // Sell-guard
    if (body.action === 'sell') {
      const existing = await db
        .select()
        .from(stockTransactions)
        .where(and(eq(stockTransactions.userId, userId), eq(stockTransactions.symbol, symbol)));
      const held = heldQty(existing.map(toEngineTx));
      if (new Decimal(body.quantity).gt(held)) {
        throw new StockError(400, 'Sell exceeds current holdings');
      }
    }

    const [row] = await db
      .insert(stockTransactions)
      .values({
        userId,
        symbol,
        exchange,
        action: body.action,
        quantity: body.quantity,
        price: String(body.price),
        brokerageFee: String(brokerageFee),
        tax: String(tax),
        broker: body.broker,
        ...(body.transactionAt ? { transactionAt: body.transactionAt } : {}),
      })
      .returning();
    return row!;
  },

  async update(userId: string, id: string, patch: UpdateStockTxBody): Promise<StockTransaction> {
    const set: Record<string, unknown> = {};
    if (patch.symbol !== undefined) set.symbol = patch.symbol.toUpperCase();
    if (patch.exchange !== undefined) set.exchange = patch.exchange;
    if (patch.action !== undefined) set.action = patch.action;
    if (patch.quantity !== undefined) set.quantity = patch.quantity;
    if (patch.price !== undefined) set.price = String(patch.price);
    if (patch.brokerageFee !== undefined) set.brokerageFee = String(patch.brokerageFee);
    if (patch.tax !== undefined) set.tax = String(patch.tax);
    if (patch.broker !== undefined) set.broker = patch.broker;
    if (patch.transactionAt !== undefined) set.transactionAt = patch.transactionAt;
    const [row] = await db
      .update(stockTransactions)
      .set(set)
      .where(and(eq(stockTransactions.id, id), eq(stockTransactions.userId, userId)))
      .returning();
    if (!row) throw new StockError(404, 'Transaction not found');
    return row;
  },

  async remove(userId: string, id: string): Promise<void> {
    const [row] = await db
      .delete(stockTransactions)
      .where(and(eq(stockTransactions.id, id), eq(stockTransactions.userId, userId)))
      .returning();
    if (!row) throw new StockError(404, 'Transaction not found');
  },

  async portfolio(userId: string) {
    const rows = await db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.userId, userId));
    const prices = await db.select().from(priceCache).where(eq(priceCache.assetType, 'stock'));
    const priceBySymbol = new Map(prices.map((p) => [p.symbol, p]));

    const bySymbol = new Map<string, StockTransaction[]>();
    for (const r of rows) {
      const list = bySymbol.get(r.symbol) ?? [];
      list.push(r);
      bySymbol.set(r.symbol, list);
    }

    type Row = {
      symbol: string;
      exchange: StockTransaction['exchange'];
      qty: string;
      avgCost: string;
      currentPrice: string | null;
      value: string | null;
      weightPct: string | null;
      pnl: string | null;
      pnlPct: string | null;
      dividendIncome: string;
    };
    const holdings: Row[] = [];
    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);
    let totalDividend = new Decimal(0);

    for (const [symbol, txs] of bySymbol) {
      const h = computeHolding(txs.map(toEngineTx));
      totalDividend = totalDividend.plus(h.dividendIncome);
      if (h.qty.isZero()) {
        if (h.dividendIncome.gt(0)) {
          holdings.push({
            symbol,
            exchange: txs[0]!.exchange,
            qty: '0',
            avgCost: '0',
            currentPrice: null,
            value: null,
            weightPct: null,
            pnl: null,
            pnlPct: null,
            dividendIncome: h.dividendIncome.toFixed(2),
          });
        }
        continue;
      }
      const priceRow = priceBySymbol.get(symbol);
      const current = priceRow?.priceBuy ? new Decimal(priceRow.priceBuy) : null;
      const value = current ? current.mul(h.qty) : null;
      const pnlObj = current ? unrealizedPnl(h.qty, h.avgCost, current) : null;
      totalInvested = totalInvested.plus(h.investedRemaining);
      if (value) totalValue = totalValue.plus(value);
      holdings.push({
        symbol,
        exchange: txs[0]!.exchange,
        qty: h.qty.toString(),
        avgCost: h.avgCost.toFixed(2),
        currentPrice: current ? current.toFixed(2) : null,
        value: value ? value.toFixed(2) : null,
        weightPct: null,
        pnl: pnlObj ? pnlObj.pnl.toFixed(2) : null,
        pnlPct: pnlObj ? pnlObj.pnlPct.toFixed(2) : null,
        dividendIncome: h.dividendIncome.toFixed(2),
      });
    }
    for (const row of holdings) {
      row.weightPct =
        row.value && !totalValue.isZero()
          ? new Decimal(row.value).div(totalValue).mul(100).toFixed(2)
          : null;
    }
    const totalPnl = totalValue.minus(totalInvested);
    return {
      holdings,
      totals: {
        value: totalValue.toFixed(2),
        invested: totalInvested.toFixed(2),
        pnl: totalPnl.toFixed(2),
        pnlPct: totalInvested.isZero() ? '0.00' : totalPnl.div(totalInvested).mul(100).toFixed(2),
        dividendIncome: totalDividend.toFixed(2),
      },
    };
  },

  async prices() {
    const rows = await db.select().from(priceCache).where(eq(priceCache.assetType, 'stock'));
    const updatedAt = rows.reduce<Date | null>(
      (max, r) => (!max || r.fetchedAt > max ? r.fetchedAt : max),
      null,
    );
    const stale = !updatedAt || Date.now() - updatedAt.getTime() > STALE_MS;
    return {
      prices: rows.map((r) => ({
        symbol: r.symbol,
        source: r.source,
        price: r.priceBuy,
        currency: r.currency,
        fetchedAt: r.fetchedAt,
      })),
      updatedAt,
      stale,
    };
  },

  async ohlc(userId: string, symbol: string, range: '1m' | '3m' | '6m') {
    const sym = symbol.toUpperCase();
    const candles = await provider.fetchOhlc(sym, range);
    const trades = await db
      .select()
      .from(stockTransactions)
      .where(and(eq(stockTransactions.userId, userId), eq(stockTransactions.symbol, sym)));
    const markers = trades
      .filter((t) => t.action === 'buy' || t.action === 'sell')
      .map((t) => ({
        time: t.transactionAt.toISOString().slice(0, 10),
        action: t.action,
        price: t.price,
      }));
    return { candles, markers };
  },
};
```

- [x] **Step 2: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 8: `stock.routes.ts` (replace stub)

**Files:**
- Modify: `apps/api/src/modules/stock/stock.routes.ts`

- [x] **Step 1: Replace the stub**

Replace the entire contents of `apps/api/src/modules/stock/stock.routes.ts`:
```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { SeedMarketDataProvider } from './market/SeedMarketDataProvider.js';
import { refreshStockPrices } from './market/refreshStockPrices.js';
import {
  createStockTxSchema,
  listStockTxQuerySchema,
  ohlcQuerySchema,
  ohlcSchema,
  stockPortfolioSchema,
  stockPricesSchema,
  stockTxSchema,
  symbolSchema,
  updateStockTxSchema,
} from './stock.schema.js';
import { stockService } from './stock.service.js';
import { searchSymbols } from './stock.symbols.js';

const idParam = z.object({ id: z.string().uuid() });
const symbolParam = z.object({ symbol: z.string().min(1).max(10) });

export const stockRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/symbols',
    {
      schema: {
        tags: ['stock'],
        querystring: z.object({ q: z.string().optional() }),
        response: { 200: z.object({ symbols: z.array(symbolSchema) }) },
      },
    },
    async (request) => ({ symbols: searchSymbols(request.query.q ?? '') }),
  );

  fastify.get(
    '/transactions',
    {
      schema: {
        tags: ['stock'],
        querystring: listStockTxQuerySchema,
        response: {
          200: z.object({
            data: z.array(stockTxSchema),
            pagination: z.object({ page: z.number(), limit: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => stockService.list(request.user.sub, request.query),
  );

  fastify.post(
    '/transactions',
    { schema: { tags: ['stock'], body: createStockTxSchema, response: { 201: stockTxSchema } } },
    async (request, reply) => {
      const tx = await stockService.create(request.user.sub, request.body);
      return reply.code(201).send(tx);
    },
  );

  fastify.put(
    '/transactions/:id',
    { schema: { tags: ['stock'], params: idParam, body: updateStockTxSchema, response: { 200: stockTxSchema } } },
    async (request) => stockService.update(request.user.sub, request.params.id, request.body),
  );

  fastify.delete(
    '/transactions/:id',
    { schema: { tags: ['stock'], params: idParam, response: { 204: z.null() } } },
    async (request, reply) => {
      await stockService.remove(request.user.sub, request.params.id);
      return reply.code(204).send();
    },
  );

  fastify.get(
    '/portfolio',
    { schema: { tags: ['stock'], response: { 200: stockPortfolioSchema } } },
    async (request) => stockService.portfolio(request.user.sub),
  );

  fastify.get(
    '/prices',
    { schema: { tags: ['stock'], response: { 200: stockPricesSchema } } },
    async () => stockService.prices(),
  );

  fastify.get(
    '/:symbol/ohlc',
    { schema: { tags: ['stock'], params: symbolParam, querystring: ohlcQuerySchema, response: { 200: ohlcSchema } } },
    async (request) => stockService.ohlc(request.user.sub, request.params.symbol, request.query.range),
  );

  fastify.post(
    '/prices/refresh',
    { schema: { tags: ['stock'], response: { 200: z.object({ refreshed: z.number() }) } } },
    async () => ({ refreshed: await refreshStockPrices(new SeedMarketDataProvider()) }),
  );
};
```

> Route order note: `/:symbol/ohlc` is registered after the literal `/transactions`, `/portfolio`, `/prices` routes, so it cannot shadow them. Keep this order.

- [x] **Step 2: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 9: Integration tests (DB-gated)

**Files:**
- Create: `apps/api/src/modules/stock/stock.routes.integration.test.ts`

- [ ] **Step 1: Write the gated test**

Create `apps/api/src/modules/stock/stock.routes.integration.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('stock routes (integration)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    await app.ready();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `stock-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
  });

  afterAll(async () => app?.close());
  const auth = () => ({ authorization: `Bearer ${token}` });

  it('buy 100 FPT then portfolio shows WAVG holding', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/stocks/transactions',
      headers: auth(),
      payload: { symbol: 'FPT', action: 'buy', quantity: 100, price: 90000 },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/stocks/portfolio', headers: auth() });
    const h = res.json().holdings.find((x: { symbol: string }) => x.symbol === 'FPT');
    expect(h.qty).toBe('100');
  });

  it('HOSE buy of 150 is rejected (lot rule)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/stocks/transactions',
      headers: auth(),
      payload: { symbol: 'FPT', action: 'buy', quantity: 150, price: 90000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('sell exceeding holdings is 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/stocks/transactions',
      headers: auth(),
      payload: { symbol: 'FPT', action: 'sell', quantity: 1000, price: 90000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refresh then prices returns rows', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/stocks/prices/refresh', headers: auth() });
    expect(r.json().refreshed).toBeGreaterThan(0);
    const p = await app.inject({ method: 'GET', url: '/v1/stocks/prices', headers: auth() });
    expect(p.json().prices.length).toBeGreaterThan(0);
  });

  it('ohlc returns candles', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/stocks/FPT/ohlc?range=1m', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().candles.length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run (no DB → skipped)**

Run: `pnpm --filter @finfolio/api test`
Expected: stock integration skipped; stockMath + symbols + schema tests pass.

- [x] **Step 3: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 10: Web — `stock.api.ts` + `fees.ts`

**Files:**
- Create: `apps/web/src/features/stock/stock.api.ts`
- Create: `apps/web/src/features/stock/fees.ts`

- [x] **Step 1: Fees port**

Create `apps/web/src/features/stock/fees.ts`:
```ts
export type StockAction = 'buy' | 'sell' | 'cash_dividend' | 'stock_dividend';
const RATES = { buyBrokerage: 0.0015, sellBrokerage: 0.0015, sellTax: 0.001 };

export function computeStockFees(action: StockAction, qty: number, price: number) {
  const value = qty * price;
  if (action === 'buy') return { brokerageFee: value * RATES.buyBrokerage, tax: 0 };
  if (action === 'sell')
    return { brokerageFee: value * RATES.sellBrokerage, tax: value * RATES.sellTax };
  return { brokerageFee: 0, tax: 0 };
}
```

- [x] **Step 2: API client**

Create `apps/web/src/features/stock/stock.api.ts`:
```ts
import { api } from '@/lib/api';
import type { StockAction } from './fees';

export type Exchange = 'HOSE' | 'HNX' | 'UPCOM';

export interface SymbolEntry {
  symbol: string;
  exchange: Exchange;
  name: string;
}
export interface StockTx {
  id: string;
  symbol: string;
  exchange: Exchange;
  action: StockAction;
  quantity: number;
  price: string;
  brokerageFee: string;
  tax: string;
  broker: string | null;
  transactionAt: string;
  createdAt: string;
}
export interface StockHolding {
  symbol: string;
  exchange: Exchange;
  qty: string;
  avgCost: string;
  currentPrice: string | null;
  value: string | null;
  weightPct: string | null;
  pnl: string | null;
  pnlPct: string | null;
  dividendIncome: string;
}
export interface StockPortfolio {
  holdings: StockHolding[];
  totals: { value: string; invested: string; pnl: string; pnlPct: string; dividendIncome: string };
}
export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}
export interface Ohlc {
  candles: Candle[];
  markers: { time: string; action: StockAction; price: string }[];
}
export interface CreateStockTxBody {
  symbol: string;
  exchange?: Exchange;
  action: StockAction;
  quantity: number;
  price: number;
  brokerageFee?: number;
  tax?: number;
  broker?: string;
  transactionAt?: string;
}

export async function searchSymbols(q: string) {
  const { data } = await api.get<{ symbols: SymbolEntry[] }>('/stocks/symbols', { params: { q } });
  return data.symbols;
}
export async function listStockTx(params: { symbol?: string; page?: number; limit?: number } = {}) {
  const { data } = await api.get<{ data: StockTx[]; pagination: { page: number; limit: number; total: number } }>(
    '/stocks/transactions',
    { params },
  );
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
```

- [x] **Step 3: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 11: Web — StockPortfolioPage + route

**Files:**
- Create: `apps/web/src/features/stock/StockPortfolioPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Create the page**

Create `apps/web/src/features/stock/StockPortfolioPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { getStockPortfolio, listStockTx } from './stock.api';

const vnd = (s: string | null) =>
  s === null ? '—' : `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(s)))} đ`;

export function StockPortfolioPage() {
  const portfolio = useQuery({ queryKey: ['stock', 'portfolio'], queryFn: getStockPortfolio });
  const txs = useQuery({ queryKey: ['stock', 'txs'], queryFn: () => listStockTx({ limit: 20 }) });
  const t = portfolio.data?.totals;
  const empty = txs.data && txs.data.data.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Quản lý Chứng khoán</h1>
          <span className="rounded-full bg-info/15 px-2 py-0.5 text-xs text-info">Giá delay 15 phút</span>
        </div>
        <Link to="/stocks/add" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          + Thêm giao dịch
        </Link>
      </div>

      {empty ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-700 p-10 text-center text-neutral-500">
          Chưa có giao dịch cổ phiếu. Nhập giao dịch đầu tiên.
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Kpi label="Giá trị danh mục" value={vnd(t?.value ?? null)} />
            <Kpi label="Tổng vốn" value={vnd(t?.invested ?? null)} />
            <Kpi
              label="P&L (%ROI)"
              value={`${vnd(t?.pnl ?? null)} (${t?.pnlPct ?? '0'}%)`}
              tone={Number(t?.pnl ?? 0) >= 0 ? 'profit' : 'loss'}
            />
            <Kpi label="Cổ tức đã nhận" value={vnd(t?.dividendIncome ?? null)} />
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
            <table className="w-full text-sm">
              <thead className="text-neutral-400">
                <tr className="border-b border-neutral-800 text-left">
                  <th className="p-3">Mã</th>
                  <th className="p-3 text-right">SL</th>
                  <th className="p-3 text-right">Giá vốn</th>
                  <th className="p-3 text-right">Giá hiện tại</th>
                  <th className="p-3 text-right">Giá trị</th>
                  <th className="p-3 text-right">% Tỷ trọng</th>
                  <th className="p-3 text-right">P&L</th>
                  <th className="p-3 text-right">% P&L</th>
                  <th className="p-3 text-right">Cổ tức</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {portfolio.data?.holdings.map((h) => (
                  <tr key={h.symbol} className="border-b border-neutral-800/50">
                    <td className="p-3 font-sans">
                      <Link to="/stocks/$symbol" params={{ symbol: h.symbol }} className="text-brand hover:underline">
                        {h.symbol}
                      </Link>
                      <span className="ml-2 text-xs text-neutral-500">{h.exchange}</span>
                    </td>
                    <td className="p-3 text-right">{h.qty}</td>
                    <td className="p-3 text-right">{vnd(h.avgCost)}</td>
                    <td className="p-3 text-right">{vnd(h.currentPrice)}</td>
                    <td className="p-3 text-right">{vnd(h.value)}</td>
                    <td className="p-3 text-right">{h.weightPct ?? '—'}%</td>
                    <td className={`p-3 text-right ${Number(h.pnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}>{vnd(h.pnl)}</td>
                    <td className={`p-3 text-right ${Number(h.pnlPct ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}>{h.pnlPct ?? '—'}%</td>
                    <td className="p-3 text-right">{vnd(h.dividendIncome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : ''}`}>
        {value}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Wire the route**

In `apps/web/src/router.tsx`:
- Add import: `import { StockPortfolioPage } from '@/features/stock/StockPortfolioPage';`
- Replace the `stocksRoute` placeholder definition with:
```ts
const stocksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stocks',
  component: StockPortfolioPage,
});
```

- [x] **Step 3: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 12: Web — StockAddPage + route

**Files:**
- Create: `apps/web/src/features/stock/StockAddPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Create the form**

Create `apps/web/src/features/stock/StockAddPage.tsx`:
```tsx
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';

import { createStockTx, searchSymbols, type Exchange } from './stock.api';
import { computeStockFees, type StockAction } from './fees';

const ACTIONS: { value: StockAction; label: string }[] = [
  { value: 'buy', label: 'Mua' },
  { value: 'sell', label: 'Bán' },
  { value: 'cash_dividend', label: 'Cổ tức tiền' },
  { value: 'stock_dividend', label: 'Cổ tức CP' },
];

export function StockAddPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<Exchange | ''>('');
  const [action, setAction] = useState<StockAction>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [broker, setBroker] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const symbols = useQuery({
    queryKey: ['stock', 'symbols', symbol],
    queryFn: () => searchSymbols(symbol),
    enabled: symbol.length > 0,
  });

  const fees = useMemo(
    () => computeStockFees(action, Number(quantity) || 0, Number(price) || 0),
    [action, quantity, price],
  );

  const onPickSymbol = (s: string, ex: Exchange) => {
    setSymbol(s);
    setExchange(ex);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createStockTx({
        symbol: symbol.toUpperCase(),
        exchange: exchange || undefined,
        action,
        quantity: Number(quantity),
        price: Number(price),
        broker: broker || undefined,
      });
      await qc.invalidateQueries({ queryKey: ['stock'] });
      void navigate({ to: '/stocks' });
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Lưu giao dịch thất bại.',
      );
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand';
  const isTrade = action === 'buy' || action === 'sell';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Nhập giao dịch cổ phiếu</h1>
      <form onSubmit={onSubmit} className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        {error && <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="relative">
            <label className="mb-1 block text-sm text-neutral-400">Mã cổ phiếu</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
              className={`${input} font-mono`}
            />
            {symbols.data && symbol.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-neutral-700 bg-neutral-900">
                {symbols.data.map((s) => (
                  <button
                    type="button"
                    key={s.symbol}
                    onClick={() => onPickSymbol(s.symbol, s.exchange)}
                    className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
                  >
                    <span className="font-mono">{s.symbol}</span>
                    <span className="text-xs text-neutral-500">{s.name} · {s.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-neutral-400">Sàn</label>
            <select value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)} className={input}>
              <option value="">Tự động</option>
              <option value="HOSE">HOSE</option>
              <option value="HNX">HNX</option>
              <option value="UPCOM">UPCOM</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-neutral-400">Hành động</label>
            <select value={action} onChange={(e) => setAction(e.target.value as StockAction)} className={input}>
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-neutral-400">Số lượng</label>
            <input type="number" step="1" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className={`${input} font-mono`} />
            {exchange === 'HOSE' && isTrade && <p className="mt-1 text-xs text-neutral-500">HOSE: bội số 100</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm text-neutral-400">Giá (đ/CP)</label>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required className={`${input} font-mono`} />
          </div>

          <div>
            <label className="mb-1 block text-sm text-neutral-400">Môi giới (tùy chọn)</label>
            <input value={broker} onChange={(e) => setBroker(e.target.value)} className={input} />
          </div>
        </div>

        {isTrade && (
          <div className="mt-4 rounded-md bg-neutral-950 p-3 text-sm text-neutral-400">
            Phí môi giới ước tính: <span className="font-mono text-neutral-200">{Math.round(fees.brokerageFee).toLocaleString('vi-VN')} đ</span>
            {action === 'sell' && (
              <> · Thuế: <span className="font-mono text-neutral-200">{Math.round(fees.tax).toLocaleString('vi-VN')} đ</span></>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => navigate({ to: '/stocks' })} className="rounded-md border border-neutral-700 px-5 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
            Huỷ
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Lưu giao dịch'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [x] **Step 2: Wire the route**

In `apps/web/src/router.tsx`:
- Add import: `import { StockAddPage } from '@/features/stock/StockAddPage';`
- Replace the `stocksAddRoute` placeholder with:
```ts
const stocksAddRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stocks/add',
  component: StockAddPage,
});
```

- [x] **Step 3: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 13: Web — StockDetailPage (candlestick) + route

**Files:**
- Create: `apps/web/src/features/stock/CandlestickChart.tsx`
- Create: `apps/web/src/features/stock/StockDetailPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Candlestick component**

Create `apps/web/src/features/stock/CandlestickChart.tsx`:
```tsx
import { createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import type { Ohlc } from './stock.api';

export function CandlestickChart({ data }: { data: Ohlc }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart: IChartApi = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: '#121214' }, textColor: '#A1A1AA' },
      grid: { vertLines: { color: '#26262C' }, horzLines: { color: '#26262C' } },
      timeScale: { borderColor: '#26262C' },
      rightPriceScale: { borderColor: '#26262C' },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#22C55E',
      downColor: '#DC2626',
      borderVisible: false,
      wickUpColor: '#22C55E',
      wickDownColor: '#DC2626',
    });
    series.setData(
      data.candles.map((c) => ({
        time: (Date.parse(c.time) / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    if (data.markers.length) {
      series.setMarkers(
        data.markers.map((m) => ({
          time: (Date.parse(m.time) / 1000) as UTCTimestamp,
          position: m.action === 'buy' ? 'belowBar' : 'aboveBar',
          color: m.action === 'buy' ? '#22C55E' : '#DC2626',
          shape: m.action === 'buy' ? 'arrowUp' : 'arrowDown',
          text: m.action === 'buy' ? 'Mua' : 'Bán',
        })),
      );
    }
    return () => chart.remove();
  }, [data]);

  return <div ref={ref} className="h-80 w-full" />;
}
```

- [x] **Step 2: Detail page**

Create `apps/web/src/features/stock/StockDetailPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { CandlestickChart } from './CandlestickChart';
import { getStockOhlc, getStockPortfolio, listStockTx } from './stock.api';

const vnd = (s: string | null) =>
  s === null ? '—' : `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(s)))} đ`;

export function StockDetailPage() {
  const { symbol } = useParams({ from: '/stocks/$symbol' });
  const ohlc = useQuery({ queryKey: ['stock', 'ohlc', symbol], queryFn: () => getStockOhlc(symbol, '3m') });
  const portfolio = useQuery({ queryKey: ['stock', 'portfolio'], queryFn: getStockPortfolio });
  const txs = useQuery({ queryKey: ['stock', 'txs', symbol], queryFn: () => listStockTx({ symbol }) });

  const holding = portfolio.data?.holdings.find((h) => h.symbol === symbol);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link to="/stocks" className="text-sm text-neutral-400 hover:text-neutral-200">← Chứng khoán</Link>
        <h1 className="text-2xl font-semibold font-mono">{symbol}</h1>
        {holding && <span className="text-xs text-neutral-500">{holding.exchange}</span>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">Biểu đồ 3 tháng</h2>
          {ohlc.data ? <CandlestickChart data={ohlc.data} /> : <div className="h-80" />}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-base font-semibold">Vị thế của bạn</h2>
          {holding ? (
            <dl className="space-y-2 text-sm">
              <Row label="Số lượng" value={holding.qty} />
              <Row label="Giá vốn (WAVG)" value={vnd(holding.avgCost)} />
              <Row label="Giá hiện tại" value={vnd(holding.currentPrice)} />
              <Row label="Giá trị" value={vnd(holding.value)} />
              <Row label="P&L" value={`${vnd(holding.pnl)} (${holding.pnlPct ?? '—'}%)`} />
              <Row label="Cổ tức đã nhận" value={vnd(holding.dividendIncome)} />
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">Chưa nắm giữ mã này.</p>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
        <h2 className="p-4 text-base font-semibold">Giao dịch của mã</h2>
        <table className="w-full text-sm">
          <thead className="text-neutral-400">
            <tr className="border-b border-neutral-800 text-left">
              <th className="p-3">Ngày</th>
              <th className="p-3">Hành động</th>
              <th className="p-3 text-right">SL</th>
              <th className="p-3 text-right">Giá</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {txs.data?.data.map((t) => (
              <tr key={t.id} className="border-b border-neutral-800/50">
                <td className="p-3">{new Date(t.transactionAt).toLocaleDateString('vi-VN')}</td>
                <td className="p-3 font-sans">{t.action}</td>
                <td className="p-3 text-right">{t.quantity}</td>
                <td className="p-3 text-right">{vnd(t.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
```

- [x] **Step 3: Wire the route**

In `apps/web/src/router.tsx`:
- Add import: `import { StockDetailPage } from '@/features/stock/StockDetailPage';`
- Add a new route under `appRoute`:
```ts
const stockDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/stocks/$symbol',
  component: StockDetailPage,
});
```
- Add `stockDetailRoute` to the `appRoute.addChildren([...])` array. **Order matters:** keep `stocksAddRoute` (`/stocks/add`) before `stockDetailRoute` (`/stocks/$symbol`) so the literal path wins over the param.

- [x] **Step 4: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Final verification

- [x] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
  Expected: typecheck clean; `stockMath` + `stock.symbols` + `stock.schema` pass; stock integration skipped (no DB) or passing (with DB).
- [x] **Web:** `pnpm --filter @finfolio/web typecheck`
  Expected: clean.
- [ ] **Manual smoke (optional, needs DB):** `docker compose up -d db`, `db:push`; login; `/stocks/add` → buy 100 FPT → `/stocks` shows WAVG holding; HOSE 150 → error; open `/stocks/FPT` → candlestick + buy marker; `POST /stocks/prices/refresh` → prices populate; record a `cash_dividend` → "Cổ tức đã nhận" increases.

---

## Acceptance criteria (from spec)

- [x] WAVG + stock-dividend cost adjustment + cash-dividend income + fees match fixtures. (Task 2)
- [x] Sell tax 0.1%, brokerage 0.15%, auto-computed when omitted, overridable. (Tasks 2, 7)
- [x] HOSE multiple-of-100 (min 100); others min 1. (Tasks 4, 7, 9)
- [x] Sell exceeding holdings → 400. (Tasks 7, 9)
- [x] Portfolio groups by symbol with capital P&L + dividend income + %weight + totals. (Tasks 7, 11)
- [ ] `/stocks`, `/stocks/add`, `/stocks/$symbol` (candlestick + markers) functional. (Tasks 11–13)
- [x] Scheduler refreshes stock prices when enabled; manual refresh + stale flag work. (Tasks 5–8)
- [x] `pnpm --filter @finfolio/api test` green; engine tests pass without a DB. (Tasks 2–4, 9)
```
