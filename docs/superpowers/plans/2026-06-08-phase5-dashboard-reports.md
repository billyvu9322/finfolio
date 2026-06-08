# Phase 5 — Dashboard & Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **NO GIT this build.** Where a normal plan would `git commit`, use the **Checkpoint** step (typecheck/test). Never run git.
>
> **Prerequisite:** Phase 2 (Gold) and Phase 3 (Stock) must be implemented — this phase reads `goldService.portfolio` and `stockService.portfolio`.

**Goal:** Cross-asset dashboard (KPIs, growth, allocation, recent activity, top holdings/movers) + a daily portfolio-snapshot job + reports (P&L by asset, monthly AUM from snapshots, CSV export, historical snapshot view).

**Architecture:** A pluggable `aggregator` normalizes each module's portfolio into a common `AssetSummary`; `dashboard.service` and `reports.service` build views on top. A daily cron snapshots every user into `portfolio_snapshots`; growth + historical views read those rows. Pure `csv` + `breakdown` helpers are unit-tested. Web uses Recharts.

**Tech Stack:** Fastify 5, Drizzle, Zod, decimal.js, node-cron, vitest (API). React 18, TanStack Router/Query, axios, recharts (Web).

**Spec:** [../specs/2026-06-08-phase5-dashboard-reports-design.md](../specs/2026-06-08-phase5-dashboard-reports-design.md)

**Reference facts:**
- `goldService.portfolio(userId)` → `{ holdings: [{ goldType, heldChi, dcaPerChi, currentPricePerChi, value, pnl, pnlPct, weightPct }], totals: { value, invested, pnl, pnlPct } }` (all strings).
- `stockService.portfolio(userId)` → `{ holdings: [{ symbol, exchange, qty, avgCost, currentPrice, value, weightPct, pnl, pnlPct, dividendIncome }], totals: { value, invested, pnl, pnlPct, dividendIncome } }`.
- `portfolio_snapshots`: `id, userId, snapshotDate (date→'YYYY-MM-DD' string), totalValue, totalInvested, pnl (jsonb), createdAt`; unique `(userId, snapshotDate)`.
- `gold_transactions` / `stock_transactions` columns as per Phases 2/3.

---

## Task 1: Web dependency (recharts)

**Files:** Modify `apps/web/package.json`

- [x] **Step 1:** Add `"recharts": "^2.13.3"` to `dependencies`.
- [x] **Step 2:** Run `pnpm install` — expect no errors.
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck` — clean.

---

## Task 2: Pure helpers — `csv` + `breakdown` (TDD)

**Files:**
- Create: `apps/api/src/lib/csv.ts`
- Create: `apps/api/src/lib/csv.test.ts`
- Create: `apps/api/src/modules/dashboard/breakdown.ts`
- Create: `apps/api/src/modules/dashboard/breakdown.test.ts`

- [x] **Step 1: Write failing tests**

Create `apps/api/src/lib/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildCsv } from './csv.js';

describe('buildCsv', () => {
  it('joins headers + rows with CRLF and a BOM', () => {
    const out = buildCsv(['a', 'b'], [[1, 2], [3, 4]]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toContain('a,b\r\n1,2\r\n3,4');
  });
  it('escapes commas, quotes, and newlines', () => {
    const out = buildCsv(['x'], [['a,b'], ['he said "hi"'], ['line\nbreak']]);
    expect(out).toContain('"a,b"');
    expect(out).toContain('"he said ""hi"""');
    expect(out).toContain('"line\nbreak"');
  });
});
```

Create `apps/api/src/modules/dashboard/breakdown.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeBreakdown } from './breakdown.js';

describe('computeBreakdown', () => {
  it('computes pct of total', () => {
    const r = computeBreakdown([
      { key: 'gold', value: new Decimal(30) },
      { key: 'stock', value: new Decimal(70) },
    ]);
    expect(r.find((x) => x.key === 'gold')!.pct).toBe('30.00');
    expect(r.find((x) => x.key === 'stock')!.pct).toBe('70.00');
  });
  it('returns 0 pct when total is 0', () => {
    const r = computeBreakdown([{ key: 'gold', value: new Decimal(0) }]);
    expect(r[0]!.pct).toBe('0.00');
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @finfolio/api test csv breakdown`
Expected: FAIL (modules missing).

- [x] **Step 3: Implement**

Create `apps/api/src/lib/csv.ts`:
```ts
function escapeField(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC-4180-ish CSV with a UTF-8 BOM (so Excel reads Vietnamese correctly). */
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeField).join(',')];
  for (const row of rows) lines.push(row.map(escapeField).join(','));
  return '﻿' + lines.join('\r\n');
}
```

Create `apps/api/src/modules/dashboard/breakdown.ts`:
```ts
import Decimal from 'decimal.js';

export function computeBreakdown(
  items: { key: string; value: Decimal }[],
): { key: string; value: string; pct: string }[] {
  const total = items.reduce((s, i) => s.plus(i.value), new Decimal(0));
  return items.map((i) => ({
    key: i.key,
    value: i.value.toFixed(2),
    pct: total.isZero() ? '0.00' : i.value.div(total).mul(100).toFixed(2),
  }));
}
```

- [x] **Step 4: Run — pass**

Run: `pnpm --filter @finfolio/api test csv breakdown`
Expected: all passed.

- [x] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 3: Aggregator

**Files:** Create `apps/api/src/modules/dashboard/aggregator.ts`

- [x] **Step 1: Implement**

Create `apps/api/src/modules/dashboard/aggregator.ts`:
```ts
import Decimal from 'decimal.js';

import { goldService } from '../gold/gold.service.js';
import { stockService } from '../stock/stock.service.js';

export type AssetClass = 'gold' | 'stock' | 'crypto';

export interface HoldingLite {
  assetClass: AssetClass;
  label: string;
  value: Decimal | null;
  pnl: Decimal | null;
  pnlPct: Decimal | null;
}

export interface AssetSummary {
  assetClass: AssetClass;
  value: Decimal;
  invested: Decimal;
  pnl: Decimal;
  holdings: HoldingLite[];
}

const dec = (s: string | null | undefined) => (s == null ? null : new Decimal(s));

interface AssetModule {
  assetClass: AssetClass;
  getSummary(userId: string): Promise<AssetSummary>;
}

const goldModule: AssetModule = {
  assetClass: 'gold',
  async getSummary(userId) {
    const p = await goldService.portfolio(userId);
    return {
      assetClass: 'gold',
      value: new Decimal(p.totals.value),
      invested: new Decimal(p.totals.invested),
      pnl: new Decimal(p.totals.pnl),
      holdings: p.holdings.map((h) => ({
        assetClass: 'gold',
        label: h.goldType,
        value: dec(h.value),
        pnl: dec(h.pnl),
        pnlPct: dec(h.pnlPct),
      })),
    };
  },
};

const stockModule: AssetModule = {
  assetClass: 'stock',
  async getSummary(userId) {
    const p = await stockService.portfolio(userId);
    return {
      assetClass: 'stock',
      value: new Decimal(p.totals.value),
      invested: new Decimal(p.totals.invested),
      pnl: new Decimal(p.totals.pnl),
      holdings: p.holdings.map((h) => ({
        assetClass: 'stock',
        label: h.symbol,
        value: dec(h.value),
        pnl: dec(h.pnl),
        pnlPct: dec(h.pnlPct),
      })),
    };
  },
};

// Add the crypto adapter here when Phase 4 lands.
export const assetModules: AssetModule[] = [goldModule, stockModule];

export async function getAssetSummaries(userId: string): Promise<AssetSummary[]> {
  return Promise.all(assetModules.map((m) => m.getSummary(userId)));
}
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 4: `dashboard.service.ts`

**Files:** Create `apps/api/src/modules/dashboard/dashboard.service.ts`

- [x] **Step 1: Implement**

Create `apps/api/src/modules/dashboard/dashboard.service.ts`:
```ts
import Decimal from 'decimal.js';
import { and, desc, eq, gte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { goldTransactions, portfolioSnapshots, stockTransactions } from '../../db/schema/index.js';
import { getAssetSummaries, type AssetClass } from './aggregator.js';
import { computeBreakdown } from './breakdown.js';

const PERIOD_DAYS: Record<string, number | null> = {
  '7d': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365,
  all: null,
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const dashboardService = {
  async summary(userId: string) {
    const summaries = await getAssetSummaries(userId);
    const aum = summaries.reduce((s, x) => s.plus(x.value), new Decimal(0));
    const invested = summaries.reduce((s, x) => s.plus(x.invested), new Decimal(0));
    const pnl = summaries.reduce((s, x) => s.plus(x.pnl), new Decimal(0));
    const breakdown = computeBreakdown(
      summaries.map((s) => ({ key: s.assetClass, value: s.value })),
    ).map((b) => {
      const src = summaries.find((s) => s.assetClass === (b.key as AssetClass))!;
      return { assetClass: b.key, value: b.value, pct: b.pct, pnl: src.pnl.toFixed(2) };
    });
    return {
      aum: aum.toFixed(2),
      invested: invested.toFixed(2),
      pnl: pnl.toFixed(2),
      pnlPct: invested.isZero() ? '0.00' : pnl.div(invested).mul(100).toFixed(2),
      breakdown,
    };
  },

  async growth(userId: string, period: string) {
    const days = PERIOD_DAYS[period] ?? null;
    const conds = [eq(portfolioSnapshots.userId, userId)];
    if (days !== null) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      conds.push(gte(portfolioSnapshots.snapshotDate, since.toISOString().slice(0, 10)));
    }
    const rows = await db
      .select()
      .from(portfolioSnapshots)
      .where(and(...conds))
      .orderBy(portfolioSnapshots.snapshotDate);

    if (rows.length === 0) {
      const s = await this.summary(userId);
      return { data: [{ date: todayStr(), value: s.aum }] };
    }
    return { data: rows.map((r) => ({ date: r.snapshotDate, value: r.totalValue })) };
  },

  async recentTransactions(userId: string, limit = 10) {
    const [gold, stock] = await Promise.all([
      db
        .select()
        .from(goldTransactions)
        .where(eq(goldTransactions.userId, userId))
        .orderBy(desc(goldTransactions.transactionAt))
        .limit(limit),
      db
        .select()
        .from(stockTransactions)
        .where(eq(stockTransactions.userId, userId))
        .orderBy(desc(stockTransactions.transactionAt))
        .limit(limit),
    ]);

    const items = [
      ...gold.map((t) => ({
        assetClass: 'gold' as AssetClass,
        title: t.goldType,
        subtitle: `${t.quantity} ${t.unit}`,
        action: t.action,
        amount: new Decimal(t.pricePerUnit).mul(t.quantity).mul(t.action === 'buy' ? -1 : 1).toFixed(2),
        date: t.transactionAt,
      })),
      ...stock.map((t) => ({
        assetClass: 'stock' as AssetClass,
        title: t.symbol,
        subtitle: `${t.quantity} CP`,
        action: t.action,
        amount: new Decimal(t.price).mul(t.quantity).mul(t.action === 'buy' ? -1 : 1).toFixed(2),
        date: t.transactionAt,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit)
      .map((x) => ({ ...x, date: x.date.toISOString() }));

    return { data: items };
  },

  async topHoldings(userId: string, limit = 5) {
    const summaries = await getAssetSummaries(userId);
    const holdings = summaries
      .flatMap((s) => s.holdings)
      .filter((h) => h.value !== null)
      .sort((a, b) => b.value!.minus(a.value!).toNumber())
      .slice(0, limit)
      .map((h) => ({
        assetClass: h.assetClass,
        label: h.label,
        value: h.value!.toFixed(2),
        pnlPct: h.pnlPct ? h.pnlPct.toFixed(2) : null,
      }));
    return { data: holdings };
  },

  async topMovers(userId: string) {
    const summaries = await getAssetSummaries(userId);
    const movers = summaries
      .flatMap((s) => s.holdings)
      .filter((h) => h.pnlPct !== null)
      .sort((a, b) => b.pnlPct!.minus(a.pnlPct!).toNumber());
    const map = (h: (typeof movers)[number]) => ({
      assetClass: h.assetClass,
      label: h.label,
      pnlPct: h.pnlPct!.toFixed(2),
    });
    return { gainers: movers.slice(0, 3).map(map), losers: movers.slice(-3).reverse().map(map) };
  },

  async createSnapshot(userId: string) {
    const summaries = await getAssetSummaries(userId);
    const totalValue = summaries.reduce((s, x) => s.plus(x.value), new Decimal(0));
    const totalInvested = summaries.reduce((s, x) => s.plus(x.invested), new Decimal(0));
    const pnl: Record<string, { value: string; invested: string; pnl: string }> = {};
    for (const s of summaries) {
      pnl[s.assetClass] = {
        value: s.value.toFixed(2),
        invested: s.invested.toFixed(2),
        pnl: s.pnl.toFixed(2),
      };
    }
    const snapshotDate = todayStr();
    await db
      .insert(portfolioSnapshots)
      .values({
        userId,
        snapshotDate,
        totalValue: totalValue.toFixed(2),
        totalInvested: totalInvested.toFixed(2),
        pnl,
      })
      .onConflictDoUpdate({
        target: [portfolioSnapshots.userId, portfolioSnapshots.snapshotDate],
        set: { totalValue: totalValue.toFixed(2), totalInvested: totalInvested.toFixed(2), pnl },
      });
    return { snapshotDate };
  },
};
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 5: Snapshot job + scheduler

**Files:**
- Create: `apps/api/src/modules/dashboard/snapshot.job.ts`
- Modify: `apps/api/src/plugins/scheduler.ts`

- [x] **Step 1: Job**

Create `apps/api/src/modules/dashboard/snapshot.job.ts`:
```ts
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { dashboardService } from './dashboard.service.js';

/** Snapshots every user's portfolio for today. Sequential (MVP scale). */
export async function snapshotAllUsers(): Promise<number> {
  const ids = await db.select({ id: users.id }).from(users);
  for (const { id } of ids) {
    await dashboardService.createSnapshot(id);
  }
  return ids.length;
}
```

- [x] **Step 2: Register daily cron**

In `apps/api/src/plugins/scheduler.ts`:
- Add import: `import { snapshotAllUsers } from '../modules/dashboard/snapshot.job.js';`
- Inside the enabled block, add:
```ts
  const snapshotTask = cron.schedule('0 0 * * *', () => {
    snapshotAllUsers()
      .then((n) => fastify.log.info(`Snapshotted ${n} users`))
      .catch((err) => fastify.log.error(err, 'Snapshot job failed'));
  });
  fastify.addHook('onClose', async () => snapshotTask.stop());
```

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 6: `dashboard.routes.ts` (replace stub)

**Files:** Modify `apps/api/src/modules/dashboard/dashboard.routes.ts`

- [x] **Step 1: Replace**

Replace the entire contents of `apps/api/src/modules/dashboard/dashboard.routes.ts`:
```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { dashboardService } from './dashboard.service.js';

export const dashboardRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/summary',
    {
      schema: {
        tags: ['dashboard'],
        response: {
          200: z.object({
            aum: z.string(),
            invested: z.string(),
            pnl: z.string(),
            pnlPct: z.string(),
            breakdown: z.array(
              z.object({ assetClass: z.string(), value: z.string(), pct: z.string(), pnl: z.string() }),
            ),
          }),
        },
      },
    },
    async (request) => dashboardService.summary(request.user.sub),
  );

  fastify.get(
    '/growth',
    {
      schema: {
        tags: ['dashboard'],
        querystring: z.object({ period: z.enum(['7d', '1m', '3m', '1y', 'all']).default('1m') }),
        response: { 200: z.object({ data: z.array(z.object({ date: z.string(), value: z.string() })) }) },
      },
    },
    async (request) => dashboardService.growth(request.user.sub, request.query.period),
  );

  fastify.get(
    '/recent-transactions',
    {
      schema: {
        tags: ['dashboard'],
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                assetClass: z.string(),
                title: z.string(),
                subtitle: z.string(),
                action: z.string(),
                amount: z.string(),
                date: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => dashboardService.recentTransactions(request.user.sub, request.query.limit),
  );

  fastify.get(
    '/top-holdings',
    {
      schema: {
        tags: ['dashboard'],
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }),
        response: {
          200: z.object({
            data: z.array(
              z.object({ assetClass: z.string(), label: z.string(), value: z.string(), pnlPct: z.string().nullable() }),
            ),
          }),
        },
      },
    },
    async (request) => dashboardService.topHoldings(request.user.sub, request.query.limit),
  );

  fastify.get(
    '/top-movers',
    {
      schema: {
        tags: ['dashboard'],
        response: {
          200: z.object({
            gainers: z.array(z.object({ assetClass: z.string(), label: z.string(), pnlPct: z.string() })),
            losers: z.array(z.object({ assetClass: z.string(), label: z.string(), pnlPct: z.string() })),
          }),
        },
      },
    },
    async (request) => dashboardService.topMovers(request.user.sub),
  );

  fastify.post(
    '/snapshot',
    { schema: { tags: ['dashboard'], response: { 200: z.object({ snapshotDate: z.string() }) } } },
    async (request) => dashboardService.createSnapshot(request.user.sub),
  );
};
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 7: `reports.service.ts`

**Files:** Create `apps/api/src/modules/reports/reports.service.ts`

- [x] **Step 1: Implement**

Create `apps/api/src/modules/reports/reports.service.ts`:
```ts
import Decimal from 'decimal.js';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

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
    const byAsset = summaries.map((s) => ({
      assetClass: s.assetClass,
      value: s.value.toFixed(2),
      invested: s.invested.toFixed(2),
      pnl: s.pnl.toFixed(2),
      pnlPct: s.invested.isZero() ? '0.00' : s.pnl.div(s.invested).mul(100).toFixed(2),
    }));

    const conds = [eq(portfolioSnapshots.userId, userId)];
    if (from) conds.push(gte(portfolioSnapshots.snapshotDate, from.toISOString().slice(0, 10)));
    if (to) conds.push(lte(portfolioSnapshots.snapshotDate, to.toISOString().slice(0, 10)));
    const snaps = await db
      .select()
      .from(portfolioSnapshots)
      .where(and(...conds))
      .orderBy(asc(portfolioSnapshots.snapshotDate));

    // Last snapshot per calendar month.
    const lastByMonth = new Map<string, string>(); // 'YYYY-MM' -> totalValue
    for (const s of snaps) lastByMonth.set(s.snapshotDate.slice(0, 7), s.totalValue);
    const months = [...lastByMonth.entries()];
    const byMonth = months.map(([month, aum], i) => {
      const prev = i > 0 ? months[i - 1]![1] : null;
      const delta = prev ? new Decimal(aum).minus(prev).toFixed(2) : '0.00';
      return { month, aum, delta };
    });

    return { byAsset, byMonth };
  },

  async exportCsv(userId: string, module: 'gold' | 'stock', from?: Date, to?: Date): Promise<string> {
    if (module === 'gold') {
      const conds = [eq(goldTransactions.userId, userId)];
      if (from) conds.push(gte(goldTransactions.transactionAt, from));
      if (to) conds.push(lte(goldTransactions.transactionAt, to));
      const rows = await db
        .select()
        .from(goldTransactions)
        .where(and(...conds))
        .orderBy(desc(goldTransactions.transactionAt));
      return buildCsv(
        ['Ngày', 'Loại vàng', 'Hành động', 'Số lượng', 'Đơn vị', 'Giá', 'Phí', 'Nơi lưu', 'Ghi chú'],
        rows.map((r) => [
          r.transactionAt.toISOString(),
          r.goldType,
          r.action,
          r.quantity,
          r.unit,
          r.pricePerUnit,
          r.fee,
          r.storage,
          r.note ?? '',
        ]),
      );
    }
    const conds = [eq(stockTransactions.userId, userId)];
    if (from) conds.push(gte(stockTransactions.transactionAt, from));
    if (to) conds.push(lte(stockTransactions.transactionAt, to));
    const rows = await db
      .select()
      .from(stockTransactions)
      .where(and(...conds))
      .orderBy(desc(stockTransactions.transactionAt));
    return buildCsv(
      ['Ngày', 'Mã', 'Sàn', 'Hành động', 'Số lượng', 'Giá', 'Phí', 'Thuế', 'Môi giới'],
      rows.map((r) => [
        r.transactionAt.toISOString(),
        r.symbol,
        r.exchange,
        r.action,
        r.quantity,
        r.price,
        r.brokerageFee,
        r.tax,
        r.broker ?? '',
      ]),
    );
  },

  async snapshotOn(userId: string, date: string) {
    const [row] = await db
      .select()
      .from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, userId), lte(portfolioSnapshots.snapshotDate, date)))
      .orderBy(desc(portfolioSnapshots.snapshotDate))
      .limit(1);
    if (!row) throw new ReportError(404, 'No snapshot on or before that date');
    return {
      snapshotDate: row.snapshotDate,
      totalValue: row.totalValue,
      totalInvested: row.totalInvested,
      pnl: row.pnl,
    };
  },
};
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 8: `report.routes.ts` (replace stub)

**Files:** Modify `apps/api/src/modules/reports/report.routes.ts`

- [x] **Step 1: Replace**

Replace the entire contents of `apps/api/src/modules/reports/report.routes.ts`:
```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { reportsService } from './reports.service.js';

export const reportRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/pnl',
    {
      schema: {
        tags: ['reports'],
        querystring: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }),
        response: {
          200: z.object({
            byAsset: z.array(
              z.object({
                assetClass: z.string(),
                value: z.string(),
                invested: z.string(),
                pnl: z.string(),
                pnlPct: z.string(),
              }),
            ),
            byMonth: z.array(z.object({ month: z.string(), aum: z.string(), delta: z.string() })),
          }),
        },
      },
    },
    async (request) => reportsService.pnlReport(request.user.sub, request.query.from, request.query.to),
  );

  fastify.get(
    '/export/csv',
    {
      schema: {
        tags: ['reports'],
        querystring: z.object({
          module: z.enum(['gold', 'stock']),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
        }),
      },
    },
    async (request, reply) => {
      const csv = await reportsService.exportCsv(
        request.user.sub,
        request.query.module,
        request.query.from,
        request.query.to,
      );
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="finfolio-${request.query.module}.csv"`)
        .send(csv);
    },
  );

  fastify.get(
    '/snapshot',
    {
      schema: {
        tags: ['reports'],
        querystring: z.object({ date: z.string() }),
        response: {
          200: z.object({
            snapshotDate: z.string(),
            totalValue: z.string(),
            totalInvested: z.string(),
            pnl: z.record(z.string(), z.unknown()),
          }),
        },
      },
    },
    async (request) => reportsService.snapshotOn(request.user.sub, request.query.date),
  );
};
```

> Note: the `/export/csv` route intentionally has no `response` schema (it returns a raw CSV string, not JSON) so the Zod serializer does not interfere.

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 9: Integration tests (DB-gated)

**Files:** Create `apps/api/src/modules/dashboard/dashboard.routes.integration.test.ts`

- [x] **Step 1: Write the gated test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('dashboard + reports (integration)', () => {
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
      payload: { email: `dash-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
    await app.inject({
      method: 'POST',
      url: '/v1/gold/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: { goldType: 'SJC_1C', action: 'buy', quantity: 10, unit: 'chi', pricePerUnit: 1000000, storage: 'Nhà' },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/stocks/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: { symbol: 'FPT', action: 'buy', quantity: 100, price: 90000 },
    });
  });

  afterAll(async () => app?.close());
  const auth = () => ({ authorization: `Bearer ${token}` });

  it('summary aggregates gold + stock', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/dashboard/summary', headers: auth() });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.breakdown.map((b: { assetClass: string }) => b.assetClass).sort()).toEqual(['gold', 'stock']);
  });

  it('snapshot then growth + reports snapshot', async () => {
    const snap = await app.inject({ method: 'POST', url: '/v1/dashboard/snapshot', headers: auth() });
    const date = snap.json().snapshotDate;
    const growth = await app.inject({ method: 'GET', url: '/v1/dashboard/growth?period=all', headers: auth() });
    expect(growth.json().data.length).toBeGreaterThanOrEqual(1);
    const rep = await app.inject({ method: 'GET', url: `/v1/reports/snapshot?date=${date}`, headers: auth() });
    expect(rep.statusCode).toBe(200);
  });

  it('csv export returns text/csv with a header line', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/reports/export/csv?module=gold', headers: auth() });
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('Loại vàng');
  });
});
```

- [x] **Step 2: Run (no DB → skipped):** `pnpm --filter @finfolio/api test` — pure tests pass; integration skipped.
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck` — clean.

---

## Task 10: Web — API clients

**Files:**
- Create: `apps/web/src/features/dashboard/dashboard.api.ts`
- Create: `apps/web/src/features/reports/reports.api.ts`

- [x] **Step 1: dashboard.api**

Create `apps/web/src/features/dashboard/dashboard.api.ts`:
```ts
import { api } from '@/lib/api';

export interface Summary {
  aum: string;
  invested: string;
  pnl: string;
  pnlPct: string;
  breakdown: { assetClass: string; value: string; pct: string; pnl: string }[];
}
export interface GrowthPoint { date: string; value: string; }
export interface RecentTx {
  assetClass: string; title: string; subtitle: string; action: string; amount: string; date: string;
}
export interface TopHolding { assetClass: string; label: string; value: string; pnlPct: string | null; }
export interface Movers {
  gainers: { assetClass: string; label: string; pnlPct: string }[];
  losers: { assetClass: string; label: string; pnlPct: string }[];
}

export const getSummary = async () => (await api.get<Summary>('/dashboard/summary')).data;
export const getGrowth = async (period: string) =>
  (await api.get<{ data: GrowthPoint[] }>('/dashboard/growth', { params: { period } })).data.data;
export const getRecentTransactions = async (limit = 10) =>
  (await api.get<{ data: RecentTx[] }>('/dashboard/recent-transactions', { params: { limit } })).data.data;
export const getTopHoldings = async (limit = 5) =>
  (await api.get<{ data: TopHolding[] }>('/dashboard/top-holdings', { params: { limit } })).data.data;
export const getTopMovers = async () => (await api.get<Movers>('/dashboard/top-movers')).data;
export const createSnapshot = async () =>
  (await api.post<{ snapshotDate: string }>('/dashboard/snapshot')).data;
```

- [x] **Step 2: reports.api (with CSV blob download)**

Create `apps/web/src/features/reports/reports.api.ts`:
```ts
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

export const getPnlReport = async (from?: string, to?: string) =>
  (await api.get<PnlReport>('/reports/pnl', { params: { from, to } })).data;

export const getSnapshot = async (date: string) =>
  (await api.get<SnapshotView>('/reports/snapshot', { params: { date } })).data;

export async function exportCsv(module: 'gold' | 'stock', from?: string, to?: string) {
  const res = await api.get('/reports/export/csv', {
    params: { module, from, to },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finfolio-${module}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck` — clean.

---

## Task 11: Web — DashboardPage + route

**Files:**
- Create: `apps/web/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Create the page**

Create `apps/web/src/features/dashboard/DashboardPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { createSnapshot, getGrowth, getSummary, getTopHoldings } from './dashboard.api';

const vnd = (s: string) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(s)))} đ`;
const COLORS: Record<string, string> = { gold: '#F59E0B', stock: '#3B82F6', crypto: '#A855F7', cash: '#64748B' };

const PERIODS = ['7d', '1m', '3m', '1y', 'all'] as const;

export function DashboardPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('1m');
  const summary = useQuery({ queryKey: ['dash', 'summary'], queryFn: getSummary });
  const growth = useQuery({ queryKey: ['dash', 'growth', period], queryFn: () => getGrowth(period) });
  const holdings = useQuery({ queryKey: ['dash', 'top'], queryFn: () => getTopHoldings(5) });

  const s = summary.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
        <button
          onClick={() => createSnapshot().then(() => growth.refetch())}
          className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          Chụp snapshot
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Kpi label="Tổng tài sản (AUM)" value={s ? vnd(s.aum) : '—'} />
        <Kpi label="Tổng vốn" value={s ? vnd(s.invested) : '—'} />
        <Kpi
          label="P&L (%ROI)"
          value={s ? `${vnd(s.pnl)} (${s.pnlPct}%)` : '—'}
          tone={s && Number(s.pnl) >= 0 ? 'profit' : 'loss'}
        />
        <Kpi label="Cash" value="0 đ" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Hiệu suất danh mục</h2>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded px-2 py-1 text-xs ${period === p ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(growth.data ?? []).map((d) => ({ date: d.date, value: Number(d.value) }))}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#71717A" fontSize={11} />
                <YAxis stroke="#71717A" fontSize={11} width={70} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#10B981" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-base font-semibold">Phân bổ tài sản</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={(s?.breakdown ?? []).map((b) => ({ name: b.assetClass, value: Number(b.value) }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                >
                  {(s?.breakdown ?? []).map((b) => (
                    <Cell key={b.assetClass} fill={COLORS[b.assetClass] ?? '#64748B'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {s?.breakdown.map((b) => (
              <li key={b.assetClass} className="flex justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[b.assetClass] }} />
                  {b.assetClass}
                </span>
                <span className="font-mono">{b.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 text-base font-semibold">Top nắm giữ</h2>
        <ul className="space-y-2">
          {holdings.data?.map((h) => (
            <li key={`${h.assetClass}-${h.label}`} className="flex justify-between text-sm">
              <span>
                {h.label} <span className="text-xs text-neutral-500">{h.assetClass}</span>
              </span>
              <span className="font-mono">{vnd(h.value)} ({h.pnlPct ?? '—'}%)</span>
            </li>
          ))}
        </ul>
      </div>
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
- Add import: `import { DashboardPage } from '@/features/dashboard/DashboardPage';`
- Replace the `dashboardRoute` placeholder definition with:
```ts
const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/dashboard',
  component: DashboardPage,
});
```

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck` — clean.

---

## Task 12: Web — ReportsPage + route

**Files:**
- Create: `apps/web/src/features/reports/ReportsPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Create the page**

Create `apps/web/src/features/reports/ReportsPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { exportCsv, getPnlReport, getSnapshot, type SnapshotView } from './reports.api';

const vnd = (s: string) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(s)))} đ`;

export function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [snapDate, setSnapDate] = useState('');
  const [snap, setSnap] = useState<SnapshotView | null>(null);
  const [snapErr, setSnapErr] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ['reports', 'pnl', from, to],
    queryFn: () => getPnlReport(from || undefined, to || undefined),
  });

  const loadSnap = async () => {
    setSnapErr(null);
    try {
      setSnap(await getSnapshot(snapDate));
    } catch {
      setSnap(null);
      setSnapErr('Không có snapshot vào/trước ngày này.');
    }
  };

  const input = 'rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <div>
      <h1 className="text-2xl font-semibold">Báo cáo P&L</h1>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-neutral-400">
          Từ
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 block ${input}`} />
        </label>
        <label className="text-sm text-neutral-400">
          Đến
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1 block ${input}`} />
        </label>
        <button onClick={() => exportCsv('gold', from || undefined, to || undefined)} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
          Export CSV Vàng
        </button>
        <button onClick={() => exportCsv('stock', from || undefined, to || undefined)} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
          Export CSV CP
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-base font-semibold">P&L theo loại tài sản</h2>
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr className="text-left">
                <th className="py-2">Loại</th>
                <th className="py-2 text-right">Giá trị</th>
                <th className="py-2 text-right">Vốn</th>
                <th className="py-2 text-right">P&L</th>
                <th className="py-2 text-right">%ROI</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {report.data?.byAsset.map((a) => (
                <tr key={a.assetClass} className="border-t border-neutral-800/50">
                  <td className="py-2 font-sans">{a.assetClass}</td>
                  <td className="py-2 text-right">{vnd(a.value)}</td>
                  <td className="py-2 text-right">{vnd(a.invested)}</td>
                  <td className={`py-2 text-right ${Number(a.pnl) >= 0 ? 'text-profit' : 'text-loss'}`}>{vnd(a.pnl)}</td>
                  <td className={`py-2 text-right ${Number(a.pnlPct) >= 0 ? 'text-profit' : 'text-loss'}`}>{a.pnlPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-base font-semibold">AUM theo tháng</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(report.data?.byMonth ?? []).map((m) => ({ month: m.month, aum: Number(m.aum) }))}>
                <XAxis dataKey="month" stroke="#71717A" fontSize={11} />
                <YAxis stroke="#71717A" fontSize={11} width={70} />
                <Tooltip />
                <Bar dataKey="aum" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 text-base font-semibold">Xem danh mục theo ngày (Snapshot)</h2>
        <div className="flex items-end gap-3">
          <input type="date" value={snapDate} onChange={(e) => setSnapDate(e.target.value)} className={input} />
          <button onClick={loadSnap} disabled={!snapDate} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
            Xem
          </button>
        </div>
        {snapErr && <p className="mt-3 text-sm text-loss">{snapErr}</p>}
        {snap && (
          <div className="mt-3 grid grid-cols-3 gap-4 font-mono text-sm">
            <div><div className="text-neutral-400">Ngày</div>{snap.snapshotDate}</div>
            <div><div className="text-neutral-400">Giá trị</div>{vnd(snap.totalValue)}</div>
            <div><div className="text-neutral-400">Vốn</div>{vnd(snap.totalInvested)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Wire the route**

In `apps/web/src/router.tsx`:
- Add import: `import { ReportsPage } from '@/features/reports/ReportsPage';`
- Replace the `reportsRoute` placeholder with:
```ts
const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports',
  component: ReportsPage,
});
```

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck` — clean.

---

## Final verification

- [x] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
  Expected: typecheck clean; `csv` + `breakdown` pass; dashboard integration skipped (no DB) or passing (with DB).
- [x] **Web:** `pnpm --filter @finfolio/web typecheck` — clean.
- [ ] **Manual smoke (needs DB):** `docker compose up -d db`, `db:push`; login; add a gold buy + stock buy; `/dashboard` shows AUM = sum, donut with gold+stock, growth point after "Chụp snapshot"; `/reports` shows P&L by asset, Export CSV downloads, snapshot date returns the row.

---

## Acceptance criteria (from spec)

- [x] `/dashboard/summary` AUM/invested/P&L = sum of Gold + Stock; breakdown % sums to 100. (Tasks 3–4, 6)
- [x] Snapshot job + `POST /dashboard/snapshot` upsert one row/user/day. (Tasks 4–5)
- [x] `/dashboard/growth` returns snapshot series or a single live point. (Task 4)
- [x] Recent transactions merge gold + stock newest-first; top holdings/movers correct. (Tasks 4, 6)
- [x] CSV export valid UTF-8 with BOM for the chosen module + range. (Tasks 2, 7–8)
- [x] `/reports/snapshot?date=` returns past-date state. (Tasks 7–8)
- [x] `/dashboard` + `/reports` functional with Recharts. (Tasks 11–12)
- [x] `pnpm --filter @finfolio/api test` green; pure tests pass without a DB. (Tasks 2, 9)
```
