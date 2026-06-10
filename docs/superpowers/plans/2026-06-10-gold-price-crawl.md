# Gold Price Crawl — Implementation Plan

> **STATUS: IMPLEMENTED.** All 9 tasks done; API+web typecheck clean; parser+resolver tests pass;
> `gold_prices` migrated; live crawl verified (5 sources). Extras beyond plan: parsers fixed to real
> HTML (BTMH `<th>` names, Thành Liên positional + `đ` suffix, Quang Hạnh ×10000) and an **XAU/USD
> world-spot source (priority 1, display-only, USD/oz)** added to the card.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or subagent-driven-development).
> Steps use checkbox (`- [x]`) syntax.
>
> **NO GIT this build.** "Commit" → **Checkpoint** (typecheck/test). Never run git.
>
> **Prerequisite:** Gold module (Phase 2) implemented. Node ≥ 23 (native `fetch`).
>
> **Spec:** [../specs/2026-06-10-gold-price-crawl-design.md](../specs/2026-06-10-gold-price-crawl-design.md)

**Goal:** Crawl 5 VN gold sources → store in new `gold_prices` table → show per-shop buy-back/sell in the
"Giá thị trường mua lại" card; daily 12:00 cron + manual refresh; feed P&L valuation (best-effort).

**Tech:** Node `fetch` + **`cheerio`** (new dep), Drizzle, Zod, vitest. No headless browser.

**Reference facts:**
- `price_cache` is single-source (`unique(asset_type, symbol)`) — DON'T reuse for multi-shop gold. New table.
- Canonical store unit = **VND/lượng**. giavang.org page ×1000; vangthanhlien page ×10 (chỉ→lượng).
- `gold.calc` runs in **chỉ** (`Q_SCALE`, 1 lượng = 10 chỉ) → valuation price must be VND/chỉ = VND/lượng ÷ 10.
- `goldService.getPrices` response shape: `{ prices: GoldPrice[], updatedAt }`, `goldPriceSchema` =
  `{ symbol, priceBuy, priceSell, currency, source, fetchedAt, stale }` — KEEP this shape (map symbol=productName, source=label).
- Scaffold migrations hand-authored (`drizzle/0000_init.sql`, `0001_exchange_sync.sql` + `meta/_journal.json`); this adds `0002`.

---

## Task 1: DB schema + migration `0002` + env

**Files:** Create `apps/api/src/db/schema/gold-prices.ts`, `apps/api/drizzle/0002_gold_prices.sql`;
Modify `apps/api/src/db/schema/index.ts`, `apps/api/drizzle/meta/_journal.json`, `apps/api/src/config/env.ts`,
root `.env.development` / `.env.production`.

- [x] **Step 1: Drizzle table** — `apps/api/src/db/schema/gold-prices.ts`:
```ts
import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const goldPrices = pgTable(
  'gold_prices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    source: varchar('source', { length: 40 }).notNull(),
    productName: varchar('product_name', { length: 120 }).notNull(),
    priceBuy: numeric('price_buy', { precision: 24, scale: 2 }),
    priceSell: numeric('price_sell', { precision: 24, scale: 2 }),
    currency: varchar('currency', { length: 10 }).notNull().default('VND'),
    unit: varchar('unit', { length: 10 }).notNull().default('luong'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceProductIdx: uniqueIndex('gold_prices_source_product_idx').on(t.source, t.productName),
    sourceIdx: index('gold_prices_source_idx').on(t.source),
  }),
);
export type GoldPrice = typeof goldPrices.$inferSelect;
export type NewGoldPrice = typeof goldPrices.$inferInsert;
```
Add `export * from './gold-prices.js';` to `schema/index.ts`.

- [x] **Step 2: SQL migration** — `apps/api/drizzle/0002_gold_prices.sql`:
```sql
CREATE TABLE "gold_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(40) NOT NULL,
  "product_name" varchar(120) NOT NULL,
  "price_buy" numeric(24,2),
  "price_sell" numeric(24,2),
  "currency" varchar(10) DEFAULT 'VND' NOT NULL,
  "unit" varchar(10) DEFAULT 'luong' NOT NULL,
  "fetched_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "gold_prices_source_product_idx" ON "gold_prices" ("source", "product_name");
CREATE INDEX "gold_prices_source_idx" ON "gold_prices" ("source");
```

- [x] **Step 3: Journal** — append to `apps/api/drizzle/meta/_journal.json` `entries`:
```json
    ,{ "idx": 2, "version": "7", "when": 1717977600000, "tag": "0002_gold_prices", "breakpoints": true }
```

- [x] **Step 4: Env** — in `config/env.ts` add:
```ts
  GOLD_CRAWL_USER_AGENT: z
    .string()
    .default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'),
```
Add placeholder to `.env.development` / `.env.production`: `GOLD_CRAWL_USER_AGENT=`.

- [x] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 2: HTML fetch util + cheerio

**Files:** Create `apps/api/src/lib/http-html.ts`; Modify `apps/api/package.json` (add `cheerio`).

- [x] **Step 1:** `pnpm --filter @finfolio/api add cheerio`.
- [x] **Step 2:** `apps/api/src/lib/http-html.ts`:
```ts
import * as cheerio from 'cheerio';
import { env } from '../config/env.js';

export async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, {
    headers: { 'User-Agent': env.GOLD_CRAWL_USER_AGENT, Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return cheerio.load(await res.text());
}
```
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 3: Source adapters + parser tests (TDD)

**Files:** Create `apps/api/src/modules/gold/market/GoldPriceSource.ts`, `GiavangOrgSource.ts`,
`VangThanhLienSource.ts`, `QuangHanhSource.ts`, `MockGoldPriceSource.ts`, `sources.ts`,
`parse.ts` (pure HTML→GoldQuote, no network); Create `apps/api/tests/modules/gold/gold-price-parse.test.ts`.

- [x] **Step 1: Interface** — `market/GoldPriceSource.ts` (`GoldQuote`, `GoldPriceSource` per spec).

- [x] **Step 2: Pure parsers** — `market/parse.ts`: export `parseGiavangOrg($, mul=1000)` and
  `parseVangThanhLien($, mul=10)` returning `GoldQuote[]` (canonical VND/lượng). Parsing takes a
  `cheerio.CheerioAPI` (so tests load fixture HTML directly, no network). Multiply page numbers by `mul`,
  strip thousands separators/`.`/`,` per each site's format.

- [x] **Step 3: Failing test** — `tests/modules/gold/gold-price-parse.test.ts`: load small inline HTML
  fixtures (a giavang.org table snippet, a vangthanhlien snippet) → assert product names + canonical
  VND/lượng (giavang `134.400` → `134400000`; thanhlien `13.550.000` → `135500000`). Run → fail.

- [x] **Step 4: Implement parsers** until green: `pnpm --filter @finfolio/api test gold-price-parse`.

- [x] **Step 5: Sources** — wrap parsers with `fetchHtml`:
  `GiavangOrgSource(key,label,path)` → `parseGiavangOrg(await fetchHtml('https://giavang.org'+path))`;
  `VangThanhLienSource` → `parseVangThanhLien(...)`; `QuangHanhSource` (fetch giavangmaothiet, parse its
  table; throws on non-200 → skipped). `MockGoldPriceSource` returns canned quotes (no network).
  `sources.ts`: `goldPriceSources()` = [sjc, doji, btmh, thanhlien, quanghanh] instances.

- [x] **Step 6: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 4: Valuation resolver (TDD, pure)

**Files:** Create `apps/api/src/modules/gold/gold-price.resolve.ts`, `tests/modules/gold/gold-price-resolve.test.ts`.

- [x] **Step 1: Failing test** — `resolveCurrentPriceLuong(goldType, rows)` returns matched `priceBuy`
  (VND/lượng) by normalized exact→substring match with source priority `['sjc','doji','btmh','thanhlien','quanghanh']`;
  returns `null` on no match. E.g. `"SJC 9999"` + rows → the SJC product's buy price; unknown type → null.
- [x] **Step 2: Implement** `gold-price.resolve.ts` (pure: normalize, prioritize, match). Run → green.
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 5: gold-price service + integration test

**Files:** Create `apps/api/src/modules/gold/gold-price.service.ts`, `tests/modules/gold/gold-price.integration.test.ts`.

- [x] **Step 1: Service** — `gold-price.service.ts`:
  - `refreshGoldPrices(sources = goldPriceSources())`: per source `try` fetch → upsert each quote into
    `gold_prices` `onConflictDoUpdate` target `[source, productName]` set `{priceBuy, priceSell, fetchedAt: new Date()}`;
    `catch` → push `{key,label,error}`, continue. Return `{ sources: [...], total }`.
  - `listGoldPrices()`: read all `gold_prices`, map to `goldPriceSchema` shape (`symbol=productName`,
    `source=label` via a key→label map, `stale = now - fetchedAt > GOLD_PRICE_STALE_MS` ~26h), `updatedAt`=max fetchedAt.
- [x] **Step 2: Integration test** (DB-gated; mock source) — pattern from
  `tests/modules/crypto/exchange/connection.integration.test.ts`:
  `const hasDb = !!process.env.DATABASE_URL; describe.skipIf(!hasDb)`. Call
  `refreshGoldPrices([new MockGoldPriceSource()])` → assert `gold_prices` rows inserted; call again →
  same row count (idempotent upsert). (Import service dynamically inside the test to avoid env validation at collect.)
- [x] **Step 3: Run** (no DB → skipped): `pnpm --filter @finfolio/api test gold-price`.
- [x] **Step 4: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 6: Wire gold service to `gold_prices`

**Files:** Modify `apps/api/src/modules/gold/gold.service.ts`.

- [x] **Step 1:** `getPrices()` → delegate to `listGoldPrices()` (new table).
- [x] **Step 2:** `getPortfolio()` → load `gold_prices` rows; build `currentPrices[goldType]` via
  `resolveCurrentPriceLuong(goldType, rows)` **÷ 10** (VND/lượng → VND/chỉ for `calculateGoldPortfolio`);
  omit entry on `null` so calc falls back to DCA (unchanged behavior).
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`.

---

## Task 7: Routes

**Files:** Modify `apps/api/src/modules/gold/gold.routes.ts`.

- [x] **Step 1:** `GET /gold/prices` already exists — unchanged (now backed by new table). Add:
```ts
  fastify.post(
    '/prices/refresh',
    { schema: { tags: ['gold'], security: [{ bearerAuth: [] }],
      response: { 200: z.object({ total: z.number(),
        sources: z.array(z.object({ key: z.string(), label: z.string(), count: z.number().optional(), error: z.string().optional() })) }) } } },
    async (_request, reply) => reply.send(await goldPriceService.refreshGoldPrices()),
  );
```
- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 8: Scheduler cron (daily 12:00)

**Files:** Modify `apps/api/src/plugins/scheduler.ts`.

- [x] **Step 1:** Inside the `ENABLE_PRICE_SCHEDULER` block add:
```ts
  const { refreshGoldPrices } = await import('../modules/gold/gold-price.service.js');
  const goldTask: ScheduledTask = cron.schedule('0 12 * * *', () => {
    refreshGoldPrices()
      .then((r) => fastify.log.info(`Gold prices refreshed: ${r.total}`))
      .catch((e) => fastify.log.error(e, 'Gold price refresh failed'));
  });
  fastify.addHook('onClose', async () => goldTask.stop());
  fastify.log.info('Gold price scheduler enabled (0 12 * * *)');
```
- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 9: Web — card per shop + manual refresh

**Files:** Modify `apps/web/src/apis/gold.api.ts`, `apps/web/src/features/gold/GoldPage.tsx`.

- [x] **Step 1: API** — `gold.api.ts`: add `refreshGoldPrices()` → `POST /gold/prices/refresh`.
- [x] **Step 2: Card** — in "Giá thị trường mua lại": group `prices` by `source` (shop); per product show
  buy-back (mua lại) + sell (VND/lượng), `fetchedAt`, `stale` badge. Add a "Cập nhật giá" button →
  `refreshGoldPrices()` then `toast` + `invalidateQueries(['gold'])`. Show per-source errors if returned.
  (Use the `sonner` toast already wired.)
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck`.

---

## Final verification

- [x] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
  Expected: clean; parser (unit conversion) + resolver tests pass; gold-price integration skipped (no DB) or passing.
- [x] **Web:** `pnpm --filter @finfolio/web typecheck` — clean.
- [x] **DB:** `pnpm --filter @finfolio/api db:migrate` adds `gold_prices`.
- [~] **Manual (network):** `POST /v1/gold/prices/refresh` (or wait for 12:00 cron) → card shows real
  prices per shop; Quang Hạnh skipped if 403; gold P&L reflects buy-back price for mapped types.
  _(crawl verified via smoke test — all 5 sources return data; full UI/cron click-through is yours)_

---

## Acceptance criteria (from spec)

- [x] Daily 12:00 cron crawls reachable sources → `gold_prices`; one source failing doesn't abort others. (Tasks 5, 8)
- [x] Card shows real buy-back + sell per shop, VND/lượng, stale badge. (Tasks 5, 9)
- [x] `POST /gold/prices/refresh` triggers on-demand crawl. (Task 7)
- [x] P&L uses crawled buy-back (mapped by gold type, ÷10 to chỉ); DCA fallback on no match. (Tasks 4, 6)
- [x] `pnpm --filter @finfolio/api test` green; parser + unit-conversion + resolver pass without network. (Tasks 3, 4)
