# Phase 2 — Gold Module — Design

> **Date:** 2026-06-08
> **Phase:** 2 (Gold)
> **Status:** Approved for planning
> **Phase doc:** [../../phases/phase-2-gold.md](../../phases/phase-2-gold.md)

## Scope

Gold transaction CRUD + weighted-average cost (DCA) + unrealized P&L + a pluggable gold-price
source with a 15-minute scheduled refresh, plus the `/gold` portfolio + `/gold/add` web screens.

**In scope (SRS FR-GOLD-01..13):**
- CRUD gold transactions with validation (sell ≤ held), filter + pagination.
- `goldMath` engine: unit conversion, DCA (WAVG, FIFO on sells), unrealized P&L.
- `PriceProvider` abstraction + a **manual/seed** provider; node-cron 15-min refresh into `price_cache`; manual refresh endpoint.
- Web: `/gold` portfolio, `/gold/add` form.
- Unit tests for the engine (correctness core) + schema; DB-gated integration tests.

**Deferred:**
- Real SJC/PNJ/DOJI HTML scraping (the `PriceProvider` interface is built now; the real parser comes later — same defer pattern as email).
- Realized P&L on sells (unrealized only this phase).
- Redis cache (in-DB `price_cache` is enough for MVP).

**Not changing:** DB schema — `gold_transactions` and `price_cache` already exist (SRS §6); no new tables or columns.

## Decisions

- **Holding grouping:** by `gold_type`. `storage` is per-transaction metadata, not a separate position.
- **P&L:** unrealized only. A sell reduces held quantity; the DCA of the remaining quantity is unchanged (FIFO consumes earliest buy lots; a partially-consumed lot has its fee prorated).
- **Price source:** `ManualGoldPriceProvider` seeds fixed buy/sell quotes into `price_cache`; real provider later.
- **Scheduler:** `node-cron`, in-process, `*/15 * * * *`, gated by env `ENABLE_PRICE_SCHEDULER` (off in test).
- **Precision:** all gold math uses `decimal.js` (Drizzle `numeric` columns return strings; never use JS floats for money).
- **New deps:** `decimal.js`, `node-cron`.

## Unit-conversion ruling (resolves SRS §10.2 inconsistency)

SRS §10.2 contradicts itself ("1 Cây = 10 Chỉ = 10 Lượng" and "1 Cây = 375g"). We adopt the
**standard Vietnamese convention**, documented here as the source of truth for the code:

| Unit | In Chỉ | Grams |
|---|---|---|
| 1 Chỉ | 1 | 3.75 g |
| 1 Lượng | 10 | 37.5 g |
| 1 Cây | 10 (≡ 1 Lượng) | 37.5 g |

- **Canonical internal unit = Chỉ.** Quantities convert to Chỉ for all math.
- **Prices normalize to VND/Chỉ.** A price entered as VND/Lượng or VND/Cây is divided by 10.
- Conversion factor map: `{ chi: 1, luong: 10, cay: 10 }`.

## API design (`apps/api/src/modules/gold`)

### `goldMath.ts` (pure, decimal.js)
- `CHI_PER_UNIT: Record<'chi'|'luong'|'cay', number> = { chi: 1, luong: 10, cay: 10 }`.
- `toChi(qty: string|number, unit): Decimal` — quantity in Chỉ.
- `pricePerChi(price: string|number, unit): Decimal` — VND per Chỉ.
- `computeHolding(txs: GoldTx[]): { heldChi: Decimal; dcaPerChi: Decimal; investedRemaining: Decimal }`
  where `GoldTx = { action, quantity, unit, pricePerUnit, fee, transactionAt }`.
  Algorithm:
  1. Sort by `transactionAt` asc (FIFO).
  2. Maintain a queue of buy lots `{ chi, costPerChi, feePerChi }` (fee folded into per-Chỉ cost: `costPerChi = pricePerChi + fee/lotChi`).
  3. For each sell, consume `sellChi` from the front of the queue (split a lot if partially consumed; the remaining portion keeps its `costPerChi`).
  4. After processing: `heldChi = Σ remaining lot.chi`; `dcaPerChi = Σ(lot.chi × lot.costPerChi) / heldChi` (0 when `heldChi == 0`); `investedRemaining = Σ(lot.chi × lot.costPerChi)`.
- `unrealizedPnl(heldChi, dcaPerChi, currentPricePerChi): { pnl: Decimal; pnlPct: Decimal }`
  `pnl = (currentPricePerChi − dcaPerChi) × heldChi`; `pnlPct = pnl / (dcaPerChi × heldChi) × 100` (0 when denominator 0).

### `gold.schema.ts` (Zod)
- `goldTypeEnumValues = ['SJC_1C','SJC_5CHI','SJC_2CHI','NHANTRON_9999','PNJ','DOJI','OTHER']` (free-text label allowed via `goldType: string(1..80)` — enum is for the dropdown; backend accepts any non-empty string ≤80).
- `createGoldTxSchema`: `goldType: string(1..80)`, `action: 'buy'|'sell'`, `quantity: number>0` (≤4 dp), `unit: 'chi'|'luong'|'cay'`, `pricePerUnit: number≥0`, `fee: number≥0 default 0`, `storage: string(1..160)`, `note: string(≤500).optional`, `transactionAt: ISO datetime (default now server-side)`.
- `updateGoldTxSchema`: same fields, all optional, ≥1 required.
- `listGoldTxQuerySchema`: `goldType?`, `action?`, `from?`, `to?` (ISO), `page: int≥1 default 1`, `limit: int 1..100 default 20`.
- Response schemas: `goldTxSchema`, `goldPortfolioSchema`, `goldPricesSchema`.

### `gold.service.ts`
- `list(userId, query)` → paginated `{ data, pagination: { page, limit, total } }`, ordered `transaction_at desc`.
- `create(userId, body)` — if `action==='sell'`, load all txs for that `goldType`, run `computeHolding`, reject when `sellChi > heldChi` (`GoldError(400,'Sell exceeds holdings')`).
- `update(userId, id, patch)` / `remove(userId, id)` — ownership-checked; both implicitly recompute on next read (no stored aggregate).
- `portfolio(userId)` — group txs by `goldType`; for each, `computeHolding` + look up current `price_cache` (asset_type='gold', symbol=goldType). **`price_cache.price_buy` is stored as VND/Chỉ**, so it is used directly as `currentPricePerChi` (no further conversion). Produce holding rows + totals. Missing price → `currentPrice=null`, P&L null, flagged.
- `prices()` — read all `price_cache` rows where `asset_type='gold'` → list + most-recent `fetched_at` + `stale` flag (older than 20 min).

### Price provider + scheduler
- `price/PriceProvider.ts`: `interface GoldPriceProvider { fetchGoldPrices(): Promise<GoldQuote[]> }`, `GoldQuote = { symbol, priceBuy, priceSell, currency: 'VND', source }`.
- `price/ManualGoldPriceProvider.ts`: returns a fixed seed list (SJC/PNJ/DOJI). **Quotes are emitted in VND/Chỉ** (the provider converts any sample VND/Lượng figures by ÷10 before returning), so `price_cache.price_buy`/`price_sell` are always VND/Chỉ. Implements the interface; the real scraping provider is added later and must emit the same VND/Chỉ unit.
- `price/refreshGoldPrices.ts`: `refreshGoldPrices(provider)` → upsert each quote into `price_cache` (`onConflict (asset_type, symbol)`), set `fetched_at = now()`.
- `plugins/scheduler.ts`: Fastify plugin; if `env.ENABLE_PRICE_SCHEDULER`, register a `node-cron` `*/15 * * * *` job calling `refreshGoldPrices(new ManualGoldPriceProvider())`; unschedule on app close.
- `config/env.ts`: add `ENABLE_PRICE_SCHEDULER: boolean default false`.

### Routes (`gold.routes.ts`, replace the stub)
All JWT-guarded (`onRequest: fastify.authenticate`):
- `GET /gold/transactions` (query schema) → list.
- `POST /gold/transactions` → 201 `{ transaction }`.
- `PUT /gold/transactions/:id` → 200 `{ transaction }`.
- `DELETE /gold/transactions/:id` → 204.
- `GET /gold/portfolio` → `{ holdings, totals }`.
- `GET /gold/prices` → `{ prices, updatedAt }`.
- `POST /gold/prices/refresh` → triggers `refreshGoldPrices` (manual), returns `{ refreshed: n }`.

## Web design (`apps/web`)

### `features/gold/gold.api.ts`
Typed client: `listGoldTx(params)`, `createGoldTx(body)`, `updateGoldTx(id, body)`, `deleteGoldTx(id)`, `getGoldPortfolio()`, `getGoldPrices()`. Types mirror API responses.

### `/gold` — GoldPortfolioPage (replace placeholder)
- KPI cards: Tổng giá trị vàng, Tổng vốn, P&L (%ROI) — TanStack Query `getGoldPortfolio`.
- Live-price panel: SJC/PNJ/DOJI buy-back + `fetched_at` timestamp + amber stale dot.
- Holdings table (mono, P&L colored): Loại vàng · Số lượng (Chỉ + Lượng) · DCA · Giá hiện tại · Giá trị · %Tỷ trọng · P&L · %P&L.
- History table: `listGoldTx` with filters (loại/hành động/khoảng-thời-gian) + pagination (20). Mua=green chip / Bán=red chip. Row edit/delete (→ confirm dialog "DCA & P&L sẽ tính lại").
- Empty state when no transactions.

### `/gold/add` — GoldAddPage (replace placeholder)
- Form (createGoldTx): gold type dropdown (enum + "Khác" free text), Mua/Bán segmented (sell blocked > held — client soft-check + server authoritative), quantity + unit selector (auto-convert preview to Chỉ), price (đ, "Dùng giá thị trường" fills from `getGoldPrices`), fee, datetime (default now), storage dropdown, note.
- Live preview: resulting DCA & unrealized P&L (compute client-side from the same conversion factors, or call portfolio after save — preview uses a small shared TS port of `toChi`/`pricePerChi`).
- On success → navigate `/gold`.

## Data flow

```
Add tx:    GoldAddPage → POST /gold/transactions → service.create (sell guard via computeHolding) → row
Portfolio: GoldPortfolioPage → GET /gold/portfolio → group by type → computeHolding + price_cache → holdings+totals
Prices:    cron */15 → ManualProvider.fetchGoldPrices → upsert price_cache ; GET /gold/prices reads cache
```

## Components & boundaries

| Unit | Does | Depends on |
|---|---|---|
| `goldMath.ts` | unit conv + DCA + P&L (pure) | decimal.js |
| `gold.service.ts` | CRUD, sell-guard, portfolio assembly | db, goldMath |
| `gold.schema.ts` | Zod I/O contracts | zod |
| `gold.routes.ts` | HTTP + guard | gold.service |
| `price/*` | provider interface + manual impl + upsert | db |
| `plugins/scheduler.ts` | cron registration | node-cron, price/* |
| web `gold.api.ts` | typed calls | lib/api |
| `GoldPortfolioPage` / `GoldAddPage` | UI | gold.api, router |

## Testing

- **Pure unit (no DB) — the correctness core:** `goldMath`
  - `toChi`/`pricePerChi` for chi/luong/cay.
  - `computeHolding`: single buy; multiple buys (WAVG); buy→partial sell (DCA unchanged, held reduced); buy→full sell (held 0, dca 0); fee folded + prorated on partial-lot consumption; sell-more-than-held handled by caller (engine just consumes available — service enforces the guard).
  - `unrealizedPnl`: gain, loss, zero-holding.
- **Schema tests:** create/update/list-query accept valid, reject invalid (qty ≤0, bad unit, empty update, bad enum/date).
- **Integration (DB-gated, skip without `DATABASE_URL`):** register→create buy→portfolio shows holding; create sell exceeding holdings → 400; list pagination; `POST /gold/prices/refresh` then `GET /gold/prices` returns rows.
- Coverage focus: `goldMath` near-100%.

## Acceptance criteria

- [ ] DCA & P&L match hand-computed fixtures including partial sells and prorated fees.
- [ ] Unit conversion follows the §10.2 ruling table (1 Lượng = 1 Cây = 10 Chỉ); price normalized to VND/Chỉ.
- [ ] Sell exceeding current holdings is rejected (400) server-side.
- [ ] `GET /gold/portfolio` groups by gold type with correct totals and %weight.
- [ ] Scheduler (when enabled) populates `price_cache` every 15 min; `GET /gold/prices` shows timestamp + stale flag; manual refresh works.
- [ ] `/gold` and `/gold/add` are functional against the API; edit/delete recompute on reload.
- [ ] `pnpm --filter @finfolio/api test` green; engine tests pass without a DB.

## Out of scope (restated)

Real price scraping, realized P&L, Redis, per-storage positions, git/CI.
