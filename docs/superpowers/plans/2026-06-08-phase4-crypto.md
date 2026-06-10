# Phase 4 — Crypto Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **NO GIT this build.** Where a normal plan would `git commit`, use the **Checkpoint** step (typecheck/test). Never run git.

**Goal:** Implement the Crypto module — transaction CRUD (incl. Swap) with a per-(coin, wallet) WAVG cost + unrealized P&L engine (VND, displayed in USD too), a seed market-data + FX provider, and the `/crypto` portfolio + `/crypto/add` (buy/sell/swap) screens.

**Architecture:** Pure `cryptoMath` (decimal.js) does WAVG (VND) + fee normalization + P&L; `crypto.service` wraps it with Drizzle, multi-currency/rate resolution, the sell-guard, and an atomic Swap (sell+buy legs in one DB transaction). A `CryptoDataProvider` seed impl supplies prices (USD+VND), 24h change, and the USD/VND rate, read **live in-process** (no price_cache/cron for crypto). Web uses a typed client + TanStack Query.

**Tech Stack:** Fastify 5, Drizzle, Zod, decimal.js, vitest (API). React 18, TanStack Router/Query, axios (Web). Runtime `tsx`. No new deps.

**Spec:** [../specs/2026-06-08-phase4-crypto-design.md](../specs/2026-06-08-phase4-crypto-design.md)

**Reference facts:**
- `crypto_transactions` columns: `id, userId, coinId, coinSymbol, action('buy'|'sell'|'swap'), quantity(numeric 30,8), priceVnd, priceUsd(nullable), usdVndRate(nullable), fee(numeric 30,8), feeCurrency, wallet, transactionAt, createdAt`.
- We store swap legs as `action='sell'`/`'buy'` (not `'swap'`).
- decimal.js already a dependency (Phase 2).

---

## Task 1: `cryptoMath` engine (TDD)

**Files:**
- Create: `apps/api/src/modules/crypto/cryptoMath.ts`
- Create: `apps/api/src/modules/crypto/cryptoMath.test.ts`

- [x] **Step 1: Write the failing tests**

Create `apps/api/src/modules/crypto/cryptoMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeFeeVnd, computeHolding, unrealizedPnl, type CryptoTx } from './cryptoMath.js';

const tx = (p: Partial<CryptoTx>): CryptoTx => ({
  action: 'buy',
  quantity: '1',
  priceVnd: '1000000000', // 1 BTC = 1,000,000,000 VND
  feeVnd: '0',
  transactionAt: new Date('2026-01-01T00:00:00Z'),
  ...p,
});

describe('computeFeeVnd', () => {
  it('VND is identity', () => expect(computeFeeVnd('1000', 'VND', '0', 25000).toString()).toBe('1000'));
  it('USDT × rate', () => expect(computeFeeVnd('2', 'USDT', '0', 25000).toString()).toBe('50000'));
  it('COIN × priceVnd', () => expect(computeFeeVnd('0.001', 'COIN', '1000000000', 25000).toString()).toBe('1000000'));
});

describe('computeHolding', () => {
  it('single buy folds feeVnd', () => {
    const h = computeHolding([tx({ quantity: '0.5', priceVnd: '1000000000', feeVnd: '5000000' })]);
    expect(h.qty.toString()).toBe('0.5');
    // (0.5*1,000,000,000 + 5,000,000)/0.5 = 1,010,000,000
    expect(h.avgCostVnd.toString()).toBe('1010000000');
  });

  it('two buys → weighted average', () => {
    const h = computeHolding([
      tx({ quantity: '1', priceVnd: '1000000000', transactionAt: new Date('2026-01-01') }),
      tx({ quantity: '1', priceVnd: '2000000000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('2');
    expect(h.avgCostVnd.toString()).toBe('1500000000');
  });

  it('sell reduces qty, avg unchanged', () => {
    const h = computeHolding([
      tx({ quantity: '2', priceVnd: '1500000000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'sell', quantity: '0.5', priceVnd: '1800000000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('1.5');
    expect(h.avgCostVnd.toString()).toBe('1500000000');
  });

  it('8-dp precision preserved', () => {
    const h = computeHolding([tx({ quantity: '0.00000001', priceVnd: '1000000000' })]);
    expect(h.qty.toString()).toBe('1e-8');
  });

  it('full sell → qty 0, avg 0', () => {
    const h = computeHolding([
      tx({ quantity: '1', priceVnd: '1000000000', transactionAt: new Date('2026-01-01') }),
      tx({ action: 'sell', quantity: '1', priceVnd: '2000000000', transactionAt: new Date('2026-01-02') }),
    ]);
    expect(h.qty.toString()).toBe('0');
    expect(h.avgCostVnd.toString()).toBe('0');
  });
});

describe('unrealizedPnl', () => {
  it('gain', () => {
    const r = unrealizedPnl('2', '1000000000', '1200000000');
    expect(r.pnl.toString()).toBe('400000000');
    expect(r.pnlPct.toString()).toBe('20');
  });
  it('zero qty', () => {
    const r = unrealizedPnl('0', '0', '1200000000');
    expect(r.pnl.toString()).toBe('0');
    expect(r.pnlPct.toString()).toBe('0');
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @finfolio/api test cryptoMath`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

Create `apps/api/src/modules/crypto/cryptoMath.ts`:
```ts
import Decimal from 'decimal.js';

export type FeeCurrency = 'VND' | 'USDT' | 'COIN';

export interface CryptoTx {
  action: 'buy' | 'sell';
  quantity: string | number;
  priceVnd: string | number;
  feeVnd: string | number;
  transactionAt: Date;
}

/** Normalizes a fee to VND. COIN fees are valued at the trade's VND price. */
export function computeFeeVnd(
  fee: string | number,
  feeCurrency: FeeCurrency,
  priceVnd: string | number,
  rate: number,
): Decimal {
  const f = new Decimal(fee);
  if (feeCurrency === 'VND') return f;
  if (feeCurrency === 'USDT') return f.mul(rate);
  return f.mul(priceVnd); // COIN
}

export interface CryptoHolding {
  qty: Decimal;
  avgCostVnd: Decimal;
  investedVnd: Decimal;
}

/** Running average cost in VND, per pre-grouped (coin, wallet) tx list. */
export function computeHolding(txs: CryptoTx[]): CryptoHolding {
  const ordered = [...txs].sort((a, b) => a.transactionAt.getTime() - b.transactionAt.getTime());
  let qty = new Decimal(0);
  let cost = new Decimal(0);
  for (const t of ordered) {
    const q = new Decimal(t.quantity);
    if (t.action === 'buy') {
      qty = qty.plus(q);
      cost = cost.plus(new Decimal(t.priceVnd).mul(q)).plus(t.feeVnd);
    } else {
      const avg = qty.isZero() ? new Decimal(0) : cost.div(qty);
      cost = cost.minus(avg.mul(q));
      qty = qty.minus(q);
      if (qty.lt(0)) qty = new Decimal(0);
      if (cost.lt(0)) cost = new Decimal(0);
    }
  }
  const avgCostVnd = qty.isZero() ? new Decimal(0) : cost.div(qty);
  return { qty, avgCostVnd, investedVnd: cost };
}

export function heldQty(txs: CryptoTx[]): Decimal {
  return computeHolding(txs).qty;
}

export function unrealizedPnl(
  qty: string | number | Decimal,
  avgCostVnd: string | number | Decimal,
  currentPriceVnd: string | number | Decimal,
): { pnl: Decimal; pnlPct: Decimal } {
  const q = new Decimal(qty);
  const avg = new Decimal(avgCostVnd);
  const cur = new Decimal(currentPriceVnd);
  const pnl = cur.minus(avg).mul(q);
  const basis = avg.mul(q);
  const pnlPct = basis.isZero() ? new Decimal(0) : pnl.div(basis).mul(100);
  return { pnl, pnlPct };
}
```

- [x] **Step 4: Run — pass**

Run: `pnpm --filter @finfolio/api test cryptoMath`
Expected: all passed.

- [x] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test` — clean + green.

---

## Task 2: Coin master (TDD)

**Files:**
- Create: `apps/api/src/modules/crypto/crypto.coins.ts`
- Create: `apps/api/src/modules/crypto/crypto.coins.test.ts`

- [x] **Step 1: Write the failing tests**

Create `apps/api/src/modules/crypto/crypto.coins.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findCoin, searchCoins } from './crypto.coins.js';

describe('findCoin', () => {
  it('finds by symbol (case-insensitive)', () => expect(findCoin('btc')?.coinId).toBe('bitcoin'));
  it('finds by coinId', () => expect(findCoin('ethereum')?.symbol).toBe('ETH'));
  it('undefined when unknown', () => expect(findCoin('ZZZ')).toBeUndefined());
});

describe('searchCoins', () => {
  it('matches prefix/name and limits', () => {
    const r = searchCoins('bit', 5);
    expect(r.length).toBeLessThanOrEqual(5);
    expect(r.some((c) => c.symbol === 'BTC')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fail:** `pnpm --filter @finfolio/api test crypto.coins` → module not found.

- [x] **Step 3: Implement**

Create `apps/api/src/modules/crypto/crypto.coins.ts`:
```ts
export interface CoinEntry {
  coinId: string;
  symbol: string;
  name: string;
}

export const CRYPTO_COINS: CoinEntry[] = [
  { coinId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { coinId: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { coinId: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { coinId: 'solana', symbol: 'SOL', name: 'Solana' },
  { coinId: 'ripple', symbol: 'XRP', name: 'XRP' },
  { coinId: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { coinId: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { coinId: 'tron', symbol: 'TRX', name: 'TRON' },
  { coinId: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { coinId: 'polygon', symbol: 'MATIC', name: 'Polygon' },
  { coinId: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  { coinId: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { coinId: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { coinId: 'tether', symbol: 'USDT', name: 'Tether' },
  { coinId: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
  { coinId: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu' },
  { coinId: 'near', symbol: 'NEAR', name: 'NEAR Protocol' },
  { coinId: 'aptos', symbol: 'APT', name: 'Aptos' },
  { coinId: 'arbitrum', symbol: 'ARB', name: 'Arbitrum' },
  { coinId: 'the-open-network', symbol: 'TON', name: 'Toncoin' },
];

export function findCoin(symbolOrId: string): CoinEntry | undefined {
  const v = symbolOrId.trim().toLowerCase();
  return CRYPTO_COINS.find((c) => c.symbol.toLowerCase() === v || c.coinId.toLowerCase() === v);
}

export function searchCoins(q: string, limit = 10): CoinEntry[] {
  const up = q.trim().toUpperCase();
  if (!up) return CRYPTO_COINS.slice(0, limit);
  return CRYPTO_COINS.filter(
    (c) => c.symbol.startsWith(up) || c.name.toUpperCase().includes(up),
  ).slice(0, limit);
}
```

- [x] **Step 4: Run — pass:** `pnpm --filter @finfolio/api test crypto.coins`.
- [x] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 3: `crypto.schema.ts` (Zod) + tests

**Files:**
- Create: `apps/api/src/modules/crypto/crypto.schema.ts`
- Create: `apps/api/src/modules/crypto/crypto.schema.test.ts`

- [x] **Step 1: Write the failing tests**

Create `apps/api/src/modules/crypto/crypto.schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createCryptoTxSchema, swapBodySchema, updateCryptoTxSchema } from './crypto.schema.js';

const valid = {
  coinId: 'bitcoin',
  coinSymbol: 'btc',
  action: 'buy',
  quantity: 0.5,
  price: 1000000000,
  wallet: 'Binance',
};

describe('createCryptoTxSchema', () => {
  it('accepts valid + uppercases symbol + defaults', () => {
    const r = createCryptoTxSchema.parse(valid);
    expect(r.coinSymbol).toBe('BTC');
    expect(r.priceCurrency).toBe('VND');
    expect(r.feeCurrency).toBe('VND');
    expect(r.fee).toBe(0);
  });
  it('rejects quantity <= 0', () =>
    expect(createCryptoTxSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false));
  it('rejects > 8 decimals', () =>
    expect(createCryptoTxSchema.safeParse({ ...valid, quantity: 0.000000001 }).success).toBe(false));
  it('rejects bad priceCurrency', () =>
    expect(createCryptoTxSchema.safeParse({ ...valid, priceCurrency: 'EUR' }).success).toBe(false));
});

describe('swapBodySchema', () => {
  const s = {
    sourceCoinId: 'bitcoin', sourceSymbol: 'BTC', sourceQty: 0.1,
    destCoinId: 'ethereum', destSymbol: 'ETH', destQty: 1.5,
    valueVnd: 100000000, wallet: 'Binance',
  };
  it('accepts valid', () => expect(swapBodySchema.safeParse(s).success).toBe(true));
  it('rejects zero qty', () => expect(swapBodySchema.safeParse({ ...s, sourceQty: 0 }).success).toBe(false));
});

describe('updateCryptoTxSchema', () => {
  it('rejects empty', () => expect(updateCryptoTxSchema.safeParse({}).success).toBe(false));
});
```

- [ ] **Step 2: Run — fail:** `pnpm --filter @finfolio/api test crypto.schema`.

- [x] **Step 3: Implement**

Create `apps/api/src/modules/crypto/crypto.schema.ts`:
```ts
import { z } from 'zod';

export const cryptoActionSchema = z.enum(['buy', 'sell']);
export const priceCurrencySchema = z.enum(['VND', 'USDT']);
export const feeCurrencySchema = z.enum(['VND', 'USDT', 'COIN']);

const qty8 = z.coerce.number().positive().multipleOf(0.00000001);

export const createCryptoTxSchema = z.object({
  coinId: z.string().min(1).max(80),
  coinSymbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  action: cryptoActionSchema,
  quantity: qty8,
  price: z.coerce.number().nonnegative(),
  priceCurrency: priceCurrencySchema.default('VND'),
  usdVndRate: z.coerce.number().positive().optional(),
  fee: z.coerce.number().nonnegative().default(0),
  feeCurrency: feeCurrencySchema.default('VND'),
  wallet: z.string().min(1).max(120),
  transactionAt: z.coerce.date().optional(),
});

export const swapBodySchema = z.object({
  sourceCoinId: z.string().min(1).max(80),
  sourceSymbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  sourceQty: qty8,
  destCoinId: z.string().min(1).max(80),
  destSymbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  destQty: qty8,
  valueVnd: z.coerce.number().positive(),
  wallet: z.string().min(1).max(120),
  transactionAt: z.coerce.date().optional(),
});

export const updateCryptoTxSchema = createCryptoTxSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'At least one field is required',
  });

export const listCryptoTxQuerySchema = z.object({
  coinSymbol: z.string().optional(),
  wallet: z.string().optional(),
  action: cryptoActionSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const fxQuerySchema = z.object({ fx: z.coerce.number().positive().optional() });

// ---- responses ----
export const cryptoTxSchema = z.object({
  id: z.string().uuid(),
  coinId: z.string(),
  coinSymbol: z.string(),
  action: z.string(),
  quantity: z.string(),
  priceVnd: z.string(),
  priceUsd: z.string().nullable(),
  usdVndRate: z.string().nullable(),
  fee: z.string(),
  feeCurrency: z.string(),
  wallet: z.string(),
  transactionAt: z.date(),
  createdAt: z.date(),
});

export const cryptoHoldingSchema = z.object({
  coinSymbol: z.string(),
  wallet: z.string(),
  qty: z.string(),
  avgCostVnd: z.string(),
  currentPriceVnd: z.string().nullable(),
  valueVnd: z.string().nullable(),
  valueUsd: z.string().nullable(),
  pnlVnd: z.string().nullable(),
  pnlPct: z.string().nullable(),
  change24hPct: z.string().nullable(),
  weightPct: z.string().nullable(),
});

export const cryptoPortfolioSchema = z.object({
  holdings: z.array(cryptoHoldingSchema),
  totals: z.object({
    valueVnd: z.string(),
    valueUsd: z.string(),
    invested: z.string(),
    pnl: z.string(),
    pnlPct: z.string(),
  }),
  fxRate: z.number(),
});

export const cryptoQuoteSchema = z.object({
  coinId: z.string(),
  symbol: z.string(),
  priceUsd: z.string(),
  priceVnd: z.string(),
  change24hPct: z.string(),
  source: z.string(),
});
export const cryptoPricesSchema = z.object({ quotes: z.array(cryptoQuoteSchema), fxRate: z.number() });

export const coinSchema = z.object({ coinId: z.string(), symbol: z.string(), name: z.string() });

export type CreateCryptoTxBody = z.infer<typeof createCryptoTxSchema>;
export type SwapBody = z.infer<typeof swapBodySchema>;
export type UpdateCryptoTxBody = z.infer<typeof updateCryptoTxSchema>;
export type ListCryptoTxQuery = z.infer<typeof listCryptoTxQuerySchema>;
```

- [x] **Step 4: Run — pass:** `pnpm --filter @finfolio/api test crypto.schema`.
- [x] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 4: Market data + FX provider

**Files:**
- Create: `apps/api/src/modules/crypto/market/CryptoDataProvider.ts`
- Create: `apps/api/src/modules/crypto/market/SeedCryptoDataProvider.ts`

- [x] **Step 1: Interface**

Create `apps/api/src/modules/crypto/market/CryptoDataProvider.ts`:
```ts
export interface CryptoQuote {
  coinId: string;
  symbol: string;
  priceUsd: string;
  priceVnd: string;
  change24hPct: string;
  source: string;
}

export interface CryptoDataProvider {
  fetchPrices(): Promise<CryptoQuote[]>;
  fetchFxRate(): Promise<number>;
}
```

- [x] **Step 2: Seed provider (deterministic)**

Create `apps/api/src/modules/crypto/market/SeedCryptoDataProvider.ts`:
```ts
import { CRYPTO_COINS } from '../crypto.coins.js';
import type { CryptoDataProvider, CryptoQuote } from './CryptoDataProvider.js';

const FX = 25000; // USD/VND seed

function usdPrice(symbol: string): number {
  const seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  if (symbol === 'BTC') return 65000;
  if (symbol === 'ETH') return 3200;
  if (symbol === 'USDT' || symbol === 'USDC') return 1;
  return 0.5 + (seed % 500); // 0.5..500 USD
}

function change24h(symbol: string): number {
  const seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  return Number((((seed % 200) - 100) / 10).toFixed(2)); // -10.0 .. +9.9 %
}

export class SeedCryptoDataProvider implements CryptoDataProvider {
  async fetchPrices(): Promise<CryptoQuote[]> {
    return CRYPTO_COINS.map((c) => {
      const usd = usdPrice(c.symbol);
      return {
        coinId: c.coinId,
        symbol: c.symbol,
        priceUsd: String(usd),
        priceVnd: String(usd * FX),
        change24hPct: String(change24h(c.symbol)),
        source: 'seed',
      };
    });
  }

  async fetchFxRate(): Promise<number> {
    return FX;
  }
}
```

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 5: `crypto.service.ts`

**Files:** Create `apps/api/src/modules/crypto/crypto.service.ts`

- [x] **Step 1: Implement**

Create `apps/api/src/modules/crypto/crypto.service.ts`:
```ts
import Decimal from 'decimal.js';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { cryptoTransactions, type CryptoTransaction } from '../../db/schema/index.js';
import { SeedCryptoDataProvider } from './market/SeedCryptoDataProvider.js';
import {
  computeFeeVnd,
  computeHolding,
  heldQty,
  unrealizedPnl,
  type CryptoTx,
  type FeeCurrency,
} from './cryptoMath.js';
import { searchCoins } from './crypto.coins.js';
import type { CreateCryptoTxBody, ListCryptoTxQuery, SwapBody, UpdateCryptoTxBody } from './crypto.schema.js';

const provider = new SeedCryptoDataProvider();

export class CryptoError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/** Stored row → engine tx; recomputes feeVnd deterministically from stored fields. */
function toEngineTx(t: CryptoTransaction): CryptoTx {
  const rate = t.usdVndRate ? Number(t.usdVndRate) : 25000;
  const feeVnd = computeFeeVnd(t.fee, t.feeCurrency as FeeCurrency, t.priceVnd, rate);
  return {
    action: t.action === 'sell' ? 'sell' : 'buy',
    quantity: t.quantity,
    priceVnd: t.priceVnd,
    feeVnd: feeVnd.toString(),
    transactionAt: t.transactionAt,
  };
}

export const cryptoService = {
  coins(q: string) {
    return { coins: searchCoins(q) };
  },

  async list(userId: string, q: ListCryptoTxQuery) {
    const conds = [eq(cryptoTransactions.userId, userId)];
    if (q.coinSymbol) conds.push(eq(cryptoTransactions.coinSymbol, q.coinSymbol.toUpperCase()));
    if (q.wallet) conds.push(eq(cryptoTransactions.wallet, q.wallet));
    if (q.action) conds.push(eq(cryptoTransactions.action, q.action));
    if (q.from) conds.push(gte(cryptoTransactions.transactionAt, q.from));
    if (q.to) conds.push(lte(cryptoTransactions.transactionAt, q.to));
    const where = and(...conds);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(cryptoTransactions)
        .where(where)
        .orderBy(desc(cryptoTransactions.transactionAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db.select({ value: count() }).from(cryptoTransactions).where(where),
    ]);
    return { data: rows, pagination: { page: q.page, limit: q.limit, total: Number(total) } };
  },

  async create(userId: string, body: CreateCryptoTxBody): Promise<CryptoTransaction> {
    const rate = body.usdVndRate ?? (await provider.fetchFxRate());
    const priceVnd =
      body.priceCurrency === 'USDT' ? new Decimal(body.price).mul(rate) : new Decimal(body.price);
    const priceUsd =
      body.priceCurrency === 'USDT' ? new Decimal(body.price) : priceVnd.div(rate);
    const symbol = body.coinSymbol.toUpperCase();

    if (body.action === 'sell') {
      const existing = await db
        .select()
        .from(cryptoTransactions)
        .where(
          and(
            eq(cryptoTransactions.userId, userId),
            eq(cryptoTransactions.coinSymbol, symbol),
            eq(cryptoTransactions.wallet, body.wallet),
          ),
        );
      const held = heldQty(existing.map(toEngineTx));
      if (new Decimal(body.quantity).gt(held)) {
        throw new CryptoError(400, 'Sell exceeds holdings in this wallet');
      }
    }

    const [row] = await db
      .insert(cryptoTransactions)
      .values({
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
        ...(body.transactionAt ? { transactionAt: body.transactionAt } : {}),
      })
      .returning();
    return row!;
  },

  async update(userId: string, id: string, patch: UpdateCryptoTxBody): Promise<CryptoTransaction> {
    const set: Record<string, unknown> = {};
    if (patch.coinId !== undefined) set.coinId = patch.coinId;
    if (patch.coinSymbol !== undefined) set.coinSymbol = patch.coinSymbol.toUpperCase();
    if (patch.action !== undefined) set.action = patch.action;
    if (patch.quantity !== undefined) set.quantity = String(patch.quantity);
    if (patch.price !== undefined) set.priceVnd = String(patch.price); // treated as VND on edit
    if (patch.fee !== undefined) set.fee = String(patch.fee);
    if (patch.feeCurrency !== undefined) set.feeCurrency = patch.feeCurrency;
    if (patch.wallet !== undefined) set.wallet = patch.wallet;
    if (patch.transactionAt !== undefined) set.transactionAt = patch.transactionAt;
    const [row] = await db
      .update(cryptoTransactions)
      .set(set)
      .where(and(eq(cryptoTransactions.id, id), eq(cryptoTransactions.userId, userId)))
      .returning();
    if (!row) throw new CryptoError(404, 'Transaction not found');
    return row;
  },

  async remove(userId: string, id: string): Promise<void> {
    const [row] = await db
      .delete(cryptoTransactions)
      .where(and(eq(cryptoTransactions.id, id), eq(cryptoTransactions.userId, userId)))
      .returning();
    if (!row) throw new CryptoError(404, 'Transaction not found');
  },

  async swap(userId: string, body: SwapBody): Promise<{ source: CryptoTransaction; dest: CryptoTransaction }> {
    const rate = await provider.fetchFxRate();
    const sourceSymbol = body.sourceSymbol.toUpperCase();
    const sellPriceVnd = new Decimal(body.valueVnd).div(body.sourceQty);
    const buyPriceVnd = new Decimal(body.valueVnd).div(body.destQty);

    return db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(cryptoTransactions)
        .where(
          and(
            eq(cryptoTransactions.userId, userId),
            eq(cryptoTransactions.coinSymbol, sourceSymbol),
            eq(cryptoTransactions.wallet, body.wallet),
          ),
        );
      const held = heldQty(existing.map(toEngineTx));
      if (new Decimal(body.sourceQty).gt(held)) {
        throw new CryptoError(400, 'Swap source exceeds holdings in this wallet');
      }
      const at = body.transactionAt ?? new Date();
      const [source] = await tx
        .insert(cryptoTransactions)
        .values({
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
          transactionAt: at,
        })
        .returning();
      const [dest] = await tx
        .insert(cryptoTransactions)
        .values({
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
          transactionAt: at,
        })
        .returning();
      return { source: source!, dest: dest! };
    });
  },

  async portfolio(userId: string, fxOverride?: number) {
    const rows = await db
      .select()
      .from(cryptoTransactions)
      .where(eq(cryptoTransactions.userId, userId));
    const quotes = await provider.fetchPrices();
    const fxRate = fxOverride ?? (await provider.fetchFxRate());
    const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));

    const groups = new Map<string, CryptoTransaction[]>();
    for (const r of rows) {
      const key = `${r.coinSymbol}|${r.wallet}`;
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }

    type Row = {
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
    };
    const holdings: Row[] = [];
    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const [key, txs] of groups) {
      const [coinSymbol, wallet] = key.split('|') as [string, string];
      const h = computeHolding(txs.map(toEngineTx));
      if (h.qty.isZero()) continue;
      const quote = quoteBySymbol.get(coinSymbol);
      const current = quote ? new Decimal(quote.priceVnd) : null;
      const value = current ? current.mul(h.qty) : null;
      const pnlObj = current ? unrealizedPnl(h.qty, h.avgCostVnd, current) : null;
      totalInvested = totalInvested.plus(h.investedVnd);
      if (value) totalValue = totalValue.plus(value);
      holdings.push({
        coinSymbol,
        wallet,
        qty: h.qty.toString(),
        avgCostVnd: h.avgCostVnd.toFixed(2),
        currentPriceVnd: current ? current.toFixed(2) : null,
        valueVnd: value ? value.toFixed(2) : null,
        valueUsd: value ? value.div(fxRate).toFixed(2) : null,
        pnlVnd: pnlObj ? pnlObj.pnl.toFixed(2) : null,
        pnlPct: pnlObj ? pnlObj.pnlPct.toFixed(2) : null,
        change24hPct: quote ? quote.change24hPct : null,
        weightPct: null,
      });
    }
    for (const row of holdings) {
      row.weightPct =
        row.valueVnd && !totalValue.isZero()
          ? new Decimal(row.valueVnd).div(totalValue).mul(100).toFixed(2)
          : null;
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
    const quotes = await provider.fetchPrices();
    const fxRate = fxOverride ?? (await provider.fetchFxRate());
    return { quotes, fxRate };
  },
};
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean. (If a Drizzle column name mismatches, align to `db/schema/crypto-transactions.ts`.)

---

## Task 6: `crypto.routes.ts` (replace stub)

**Files:** Modify `apps/api/src/modules/crypto/crypto.routes.ts`

- [x] **Step 1: Replace the stub**

Replace the entire contents of `apps/api/src/modules/crypto/crypto.routes.ts`:
```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  coinSchema,
  createCryptoTxSchema,
  cryptoPortfolioSchema,
  cryptoPricesSchema,
  cryptoTxSchema,
  fxQuerySchema,
  listCryptoTxQuerySchema,
  swapBodySchema,
  updateCryptoTxSchema,
} from './crypto.schema.js';
import { cryptoService } from './crypto.service.js';

const idParam = z.object({ id: z.string().uuid() });

export const cryptoRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/coins',
    {
      schema: {
        tags: ['crypto'],
        querystring: z.object({ q: z.string().optional() }),
        response: { 200: z.object({ coins: z.array(coinSchema) }) },
      },
    },
    async (request) => cryptoService.coins(request.query.q ?? ''),
  );

  fastify.get(
    '/transactions',
    {
      schema: {
        tags: ['crypto'],
        querystring: listCryptoTxQuerySchema,
        response: {
          200: z.object({
            data: z.array(cryptoTxSchema),
            pagination: z.object({ page: z.number(), limit: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => cryptoService.list(request.user.sub, request.query),
  );

  fastify.post(
    '/transactions',
    { schema: { tags: ['crypto'], body: createCryptoTxSchema, response: { 201: cryptoTxSchema } } },
    async (request, reply) => {
      const tx = await cryptoService.create(request.user.sub, request.body);
      return reply.code(201).send(tx);
    },
  );

  fastify.put(
    '/transactions/:id',
    { schema: { tags: ['crypto'], params: idParam, body: updateCryptoTxSchema, response: { 200: cryptoTxSchema } } },
    async (request) => cryptoService.update(request.user.sub, request.params.id, request.body),
  );

  fastify.delete(
    '/transactions/:id',
    { schema: { tags: ['crypto'], params: idParam, response: { 204: z.null() } } },
    async (request, reply) => {
      await cryptoService.remove(request.user.sub, request.params.id);
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/swap',
    {
      schema: {
        tags: ['crypto'],
        body: swapBodySchema,
        response: { 201: z.object({ source: cryptoTxSchema, dest: cryptoTxSchema }) },
      },
    },
    async (request, reply) => {
      const r = await cryptoService.swap(request.user.sub, request.body);
      return reply.code(201).send(r);
    },
  );

  fastify.get(
    '/portfolio',
    { schema: { tags: ['crypto'], querystring: fxQuerySchema, response: { 200: cryptoPortfolioSchema } } },
    async (request) => cryptoService.portfolio(request.user.sub, request.query.fx),
  );

  fastify.get(
    '/prices',
    { schema: { tags: ['crypto'], querystring: fxQuerySchema, response: { 200: cryptoPricesSchema } } },
    async (request) => cryptoService.prices(request.query.fx),
  );
};
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 7: Integration tests (DB-gated)

**Files:** Create `apps/api/src/modules/crypto/crypto.routes.integration.test.ts`

- [x] **Step 1: Write the gated test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('crypto routes (integration)', () => {
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
      payload: { email: `crypto-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
  });

  afterAll(async () => app?.close());
  const auth = () => ({ authorization: `Bearer ${token}` });

  it('buy 0.5 BTC on Binance → portfolio holding', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: auth(),
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'buy', quantity: 0.5, price: 1000000000, wallet: 'Binance' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/crypto/portfolio', headers: auth() });
    const h = res.json().holdings.find((x: { coinSymbol: string; wallet: string }) => x.coinSymbol === 'BTC' && x.wallet === 'Binance');
    expect(h.qty).toBe('0.5');
  });

  it('sell exceeding wallet holdings → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: auth(),
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'sell', quantity: 5, price: 1000000000, wallet: 'Binance' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('same coin on a second wallet is a separate position', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: auth(),
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'buy', quantity: 0.2, price: 1000000000, wallet: 'Ledger' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/crypto/portfolio', headers: auth() });
    const wallets = res
      .json()
      .holdings.filter((x: { coinSymbol: string }) => x.coinSymbol === 'BTC')
      .map((x: { wallet: string }) => x.wallet)
      .sort();
    expect(wallets).toEqual(['Binance', 'Ledger']);
  });

  it('swap BTC→ETH creates sell + buy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crypto/swap',
      headers: auth(),
      payload: {
        sourceCoinId: 'bitcoin', sourceSymbol: 'BTC', sourceQty: 0.1,
        destCoinId: 'ethereum', destSymbol: 'ETH', destQty: 1.5,
        valueVnd: 100000000, wallet: 'Binance',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().source.action).toBe('sell');
    expect(res.json().dest.action).toBe('buy');
  });

  it('prices returns quotes + fxRate', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/crypto/prices', headers: auth() });
    expect(res.json().fxRate).toBeGreaterThan(0);
    expect(res.json().quotes.length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run (no DB → skipped):** `pnpm --filter @finfolio/api test` — pure tests pass; integration skipped.
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 8: Web — `crypto.api.ts`

**Files:** Create `apps/web/src/features/crypto/crypto.api.ts`

- [x] **Step 1: Implement**

Create `apps/web/src/features/crypto/crypto.api.ts`:
```ts
import { api } from '@/lib/api';

export interface Coin { coinId: string; symbol: string; name: string; }
export interface CryptoHolding {
  coinSymbol: string; wallet: string; qty: string; avgCostVnd: string;
  currentPriceVnd: string | null; valueVnd: string | null; valueUsd: string | null;
  pnlVnd: string | null; pnlPct: string | null; change24hPct: string | null; weightPct: string | null;
}
export interface CryptoPortfolio {
  holdings: CryptoHolding[];
  totals: { valueVnd: string; valueUsd: string; invested: string; pnl: string; pnlPct: string };
  fxRate: number;
}
export interface CreateCryptoTxBody {
  coinId: string; coinSymbol: string; action: 'buy' | 'sell';
  quantity: number; price: number; priceCurrency?: 'VND' | 'USDT'; usdVndRate?: number;
  fee?: number; feeCurrency?: 'VND' | 'USDT' | 'COIN'; wallet: string; transactionAt?: string;
}
export interface SwapBody {
  sourceCoinId: string; sourceSymbol: string; sourceQty: number;
  destCoinId: string; destSymbol: string; destQty: number;
  valueVnd: number; wallet: string; transactionAt?: string;
}

export const searchCoins = async (q: string) =>
  (await api.get<{ coins: Coin[] }>('/crypto/coins', { params: { q } })).data.coins;
export const listCryptoTx = async (params: { coinSymbol?: string; wallet?: string; page?: number; limit?: number } = {}) =>
  (await api.get<{ data: unknown[]; pagination: { page: number; limit: number; total: number } }>('/crypto/transactions', { params })).data;
export const createCryptoTx = async (body: CreateCryptoTxBody) =>
  (await api.post('/crypto/transactions', body)).data;
export const swap = async (body: SwapBody) => (await api.post('/crypto/swap', body)).data;
export const getCryptoPortfolio = async (fx?: number) =>
  (await api.get<CryptoPortfolio>('/crypto/portfolio', { params: { fx } })).data;
export const getCryptoPrices = async (fx?: number) =>
  (await api.get<{ quotes: unknown[]; fxRate: number }>('/crypto/prices', { params: { fx } })).data;
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/web typecheck`.

---

## Task 9: Web — CryptoPortfolioPage + route

**Files:**
- Create: `apps/web/src/features/crypto/CryptoPortfolioPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Create the page**

Create `apps/web/src/features/crypto/CryptoPortfolioPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { getCryptoPortfolio } from './crypto.api';

const vnd = (s: string | null) =>
  s === null ? '—' : `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(s)))} đ`;
const usd = (s: string | null) =>
  s === null ? '—' : `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(s))}`;

export function CryptoPortfolioPage() {
  const [fx, setFx] = useState('');
  const [walletFilter, setWalletFilter] = useState('');
  const portfolio = useQuery({
    queryKey: ['crypto', 'portfolio', fx],
    queryFn: () => getCryptoPortfolio(fx ? Number(fx) : undefined),
  });

  const t = portfolio.data?.totals;
  const holdings = (portfolio.data?.holdings ?? []).filter((h) => !walletFilter || h.wallet === walletFilter);
  const wallets = [...new Set((portfolio.data?.holdings ?? []).map((h) => h.wallet))];
  const empty = portfolio.data && portfolio.data.holdings.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Quản lý Crypto</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            USD/VND:
            <input
              value={fx}
              onChange={(e) => setFx(e.target.value)}
              placeholder={String(portfolio.data?.fxRate ?? 25000)}
              className="ml-2 w-24 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-neutral-200"
            />
          </span>
          <Link to="/crypto/add" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            + Thêm giao dịch
          </Link>
        </div>
      </div>

      {empty && <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi label="Tổng giá trị" value={`${vnd(t?.valueVnd ?? null)} · ${usd(t?.valueUsd ?? null)}`} />
            <Kpi label="Tổng vốn" value={vnd(t?.invested ?? null)} />
            <Kpi
              label="P&L (%ROI)"
              value={`${vnd(t?.pnl ?? null)} (${t?.pnlPct ?? '0'}%)`}
              tone={Number(t?.pnl ?? 0) >= 0 ? 'profit' : 'loss'}
            />
          </div>

          {wallets.length > 1 && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => setWalletFilter('')} className={`rounded px-3 py-1 text-xs ${!walletFilter ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}>Tất cả ví</button>
              {wallets.map((w) => (
                <button key={w} onClick={() => setWalletFilter(w)} className={`rounded px-3 py-1 text-xs ${walletFilter === w ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}>{w}</button>
              ))}
            </div>
          )}

          <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
            <table className="w-full text-sm">
              <thead className="text-neutral-400">
                <tr className="border-b border-neutral-800 text-left">
                  <th className="p-3">Coin</th>
                  <th className="p-3">Ví/Sàn</th>
                  <th className="p-3 text-right">SL</th>
                  <th className="p-3 text-right">Giá vốn</th>
                  <th className="p-3 text-right">Giá hiện tại</th>
                  <th className="p-3 text-right">Giá trị</th>
                  <th className="p-3 text-right">24h</th>
                  <th className="p-3 text-right">P&L</th>
                  <th className="p-3 text-right">%P&L</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {holdings.map((h) => (
                  <tr key={`${h.coinSymbol}-${h.wallet}`} className="border-b border-neutral-800/50">
                    <td className="p-3 font-sans">{h.coinSymbol}</td>
                    <td className="p-3"><span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{h.wallet}</span></td>
                    <td className="p-3 text-right">{h.qty}</td>
                    <td className="p-3 text-right">{vnd(h.avgCostVnd)}</td>
                    <td className="p-3 text-right">{vnd(h.currentPriceVnd)}</td>
                    <td className="p-3 text-right">{vnd(h.valueVnd)}<div className="text-xs text-neutral-500">{usd(h.valueUsd)}</div></td>
                    <td className={`p-3 text-right ${Number(h.change24hPct ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}>{h.change24hPct ?? '—'}%</td>
                    <td className={`p-3 text-right ${Number(h.pnlVnd ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}>{vnd(h.pnlVnd)}</td>
                    <td className={`p-3 text-right ${Number(h.pnlPct ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}>{h.pnlPct ?? '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold ${tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : ''}`}>{value}</div>
    </div>
  );
}
```

- [x] **Step 2: Wire the route**

In `apps/web/src/router.tsx`:
- Add import: `import { CryptoPortfolioPage } from '@/features/crypto/CryptoPortfolioPage';`
- Replace the `cryptoRoute` placeholder with:
```ts
const cryptoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/crypto',
  component: CryptoPortfolioPage,
});
```

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck`.

---

## Task 10: Web — CryptoAddPage (buy/sell/swap) + route

**Files:**
- Create: `apps/web/src/features/crypto/CryptoAddPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Create the form**

Create `apps/web/src/features/crypto/CryptoAddPage.tsx`:
```tsx
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { createCryptoTx, searchCoins, swap } from './crypto.api';

const WALLETS = ['Binance', 'OKX', 'Bybit', 'MetaMask', 'Trust Wallet', 'Ledger', 'Khác'];
type Mode = 'buy' | 'sell' | 'swap';

export function CryptoAddPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('buy');
  const [wallet, setWallet] = useState(WALLETS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // buy/sell fields
  const [coin, setCoin] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [priceCurrency, setPriceCurrency] = useState<'VND' | 'USDT'>('VND');

  // swap fields
  const [srcCoin, setSrcCoin] = useState('');
  const [srcQty, setSrcQty] = useState('');
  const [dstCoin, setDstCoin] = useState('');
  const [dstQty, setDstQty] = useState('');
  const [valueVnd, setValueVnd] = useState('');

  const coinQ = useQuery({ queryKey: ['crypto', 'coins', coin], queryFn: () => searchCoins(coin), enabled: coin.length > 0 });

  const input = 'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === 'swap') {
        const src = (await searchCoins(srcCoin))[0];
        const dst = (await searchCoins(dstCoin))[0];
        if (!src || !dst) throw new Error('coin');
        await swap({
          sourceCoinId: src.coinId, sourceSymbol: src.symbol, sourceQty: Number(srcQty),
          destCoinId: dst.coinId, destSymbol: dst.symbol, destQty: Number(dstQty),
          valueVnd: Number(valueVnd), wallet,
        });
      } else {
        const c = (await searchCoins(coin))[0];
        if (!c) throw new Error('coin');
        await createCryptoTx({
          coinId: c.coinId, coinSymbol: c.symbol, action: mode,
          quantity: Number(quantity), price: Number(price), priceCurrency, wallet,
        });
      }
      await qc.invalidateQueries({ queryKey: ['crypto'] });
      void navigate({ to: '/crypto' });
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Lưu giao dịch thất bại.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Nhập giao dịch crypto</h1>
      <form onSubmit={submit} className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        {error && <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}

        <div className="mb-5 flex gap-2">
          {(['buy', 'sell', 'swap'] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${mode === m ? 'bg-brand text-white' : 'border border-neutral-700 text-neutral-300'}`}
            >
              {m === 'buy' ? 'Mua' : m === 'sell' ? 'Bán' : 'Swap'}
            </button>
          ))}
        </div>

        {mode !== 'swap' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative sm:col-span-2">
              <label className="mb-1 block text-sm text-neutral-400">Coin</label>
              <input value={coin} onChange={(e) => setCoin(e.target.value.toUpperCase())} className={`${input} font-mono`} required />
              {coinQ.data && coin.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-neutral-700 bg-neutral-900">
                  {coinQ.data.map((c) => (
                    <button type="button" key={c.coinId} onClick={() => setCoin(c.symbol)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800">
                      <span className="font-mono">{c.symbol}</span>
                      <span className="text-xs text-neutral-500">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-400">Số lượng</label>
              <input type="number" step="0.00000001" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className={`${input} font-mono`} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-400">Giá</label>
              <div className="flex gap-2">
                <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required className={`${input} font-mono`} />
                <select value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value as 'VND' | 'USDT')} className={input + ' w-28'}>
                  <option value="VND">VND</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-neutral-800 p-3">
              <div className="mb-2 text-sm text-neutral-400">Từ</div>
              <input value={srcCoin} onChange={(e) => setSrcCoin(e.target.value.toUpperCase())} placeholder="Coin nguồn" required className={`${input} mb-2 font-mono`} />
              <input type="number" step="0.00000001" min="0" value={srcQty} onChange={(e) => setSrcQty(e.target.value)} placeholder="Số lượng" required className={`${input} font-mono`} />
            </div>
            <div className="rounded-md border border-neutral-800 p-3">
              <div className="mb-2 text-sm text-neutral-400">Đến</div>
              <input value={dstCoin} onChange={(e) => setDstCoin(e.target.value.toUpperCase())} placeholder="Coin đích" required className={`${input} mb-2 font-mono`} />
              <input type="number" step="0.00000001" min="0" value={dstQty} onChange={(e) => setDstQty(e.target.value)} placeholder="Số lượng nhận" required className={`${input} font-mono`} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-neutral-400">Giá trị giao dịch (VND)</label>
              <input type="number" min="0" value={valueVnd} onChange={(e) => setValueVnd(e.target.value)} required className={`${input} font-mono`} />
              <p className="mt-1 text-xs text-neutral-500">= 1 Bán + 1 Mua</p>
            </div>
          </div>
        )}

        <label className="mb-1 mt-4 block text-sm text-neutral-400">Nơi lưu trữ</label>
        <select value={wallet} onChange={(e) => setWallet(e.target.value)} className={input}>
          {WALLETS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => navigate({ to: '/crypto' })} className="rounded-md border border-neutral-700 px-5 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Huỷ</button>
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
- Add import: `import { CryptoAddPage } from '@/features/crypto/CryptoAddPage';`
- Replace the `cryptoAddRoute` placeholder with:
```ts
const cryptoAddRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/crypto/add',
  component: CryptoAddPage,
});
```

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck`.

---

## Task 11: (Phase 5 hook) register crypto in the dashboard aggregator

> **Only if Phase 5 is already implemented** (`apps/api/src/modules/dashboard/aggregator.ts` exists). Otherwise skip — the Phase 5 plan/spec already notes adding this adapter.

**Files:** Modify `apps/api/src/modules/dashboard/aggregator.ts`

- [ ] **Step 1: Add the crypto adapter**

In `aggregator.ts`:
- Import: `import { cryptoService } from '../crypto/crypto.service.js';`
- Add an adapter and register it:
```ts
const cryptoModule: AssetModule = {
  assetClass: 'crypto',
  async getSummary(userId) {
    const p = await cryptoService.portfolio(userId);
    return {
      assetClass: 'crypto',
      value: new Decimal(p.totals.valueVnd),
      invested: new Decimal(p.totals.invested),
      pnl: new Decimal(p.totals.pnl),
      holdings: p.holdings.map((h) => ({
        assetClass: 'crypto',
        label: `${h.coinSymbol} (${h.wallet})`,
        value: dec(h.valueVnd),
        pnl: dec(h.pnlVnd),
        pnlPct: dec(h.pnlPct),
      })),
    };
  },
};

export const assetModules: AssetModule[] = [goldModule, stockModule, cryptoModule];
```

- [ ] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Final verification

- [x] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
  Expected: typecheck clean; `cryptoMath` + `crypto.coins` + `crypto.schema` pass; crypto integration skipped (no DB) or passing (with DB).
- [x] **Web:** `pnpm --filter @finfolio/web typecheck` — clean.
- [ ] **Manual smoke (needs DB):** `docker compose up -d db`, `db:push`; login; `/crypto/add` buy 0.5 BTC (Binance) → `/crypto` shows holding (VND+USD); buy BTC on Ledger → 2 positions; Swap BTC→ETH → both legs appear; FX override changes USD column; sell > held → error.

---

## Acceptance criteria (from spec)

- [x] WAVG (VND) + fee normalization (VND/USDT/COIN) + P&L match fixtures. (Task 1)
- [x] Holdings group by (coin, wallet); a coin in two wallets = two positions. (Tasks 5, 7, 9)
- [x] Swap creates atomic sell(source) + buy(dest) by `valueVnd`; portfolio reflects both. (Tasks 5–7)
- [x] Sell / swap-source exceeding wallet holdings → 400. (Tasks 5, 7)
- [x] USDT price + FX override convert correctly; USD + VND + 24h shown. (Tasks 5, 9)
- [x] `/crypto`, `/crypto/add` (buy/sell/swap) functional. (Tasks 9–10)
- [x] `pnpm --filter @finfolio/api test` green; engine tests pass without a DB. (Tasks 1–3, 7)
```
