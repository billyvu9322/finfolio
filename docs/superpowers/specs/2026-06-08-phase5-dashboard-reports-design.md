# Phase 5 — Dashboard & Reports — Design

> **Date:** 2026-06-08
> **Phase:** 5 (Dashboard & Reports)
> **Status:** Approved for planning
> **Phase doc:** [../../phases/phase-5-dashboard-reports.md](../../phases/phase-5-dashboard-reports.md)

## Dependency note

Aggregation reads each asset module's portfolio. **Implementation of this phase requires Phase 2
(Gold) and Phase 3 (Stock) to be implemented** (their `*.service.portfolio` exist). Phase 4 (Crypto)
is **not** required: the aggregator is a registry — Gold + Stock now, Crypto added as one entry when
Phase 4 lands.

## Scope

Cross-asset dashboard (KPIs, growth, allocation, recent activity, top holdings/movers) + a daily
portfolio-snapshot job + reports (current P&L by asset, monthly AUM from snapshots, CSV export,
historical snapshot view).

**In scope (SRS FR-DASH-01..06 partial, FR-RPT-01..03):**
- Pluggable aggregator over Gold + Stock portfolios.
- `GET /dashboard/summary | growth | recent-transactions | top-holdings | top-movers`, `POST /dashboard/snapshot`.
- Daily snapshot cron + manual snapshot.
- `GET /reports/pnl | export/csv | snapshot`.
- Web `/dashboard` and `/reports` (Recharts).
- Pure unit tests (CSV, breakdown, growth mapping) + DB-gated integration.

**Deferred / placeholder (FR-DASH-05/07 extras):**
- VN-Index compare line, AI alerts widget — omitted/placeholder.
- Cash balance — shown as 0 (no cash module in MVP).
- Realized monthly P&L — only unrealized is tracked; monthly view uses snapshot AUM deltas, not realized gains.

**Not changing:** DB schema — `portfolio_snapshots` already exists (`snapshotDate` is a `date` → string `YYYY-MM-DD`; `totalValue`/`totalInvested` numeric strings; `pnl` jsonb breakdown). No new tables.

## Decisions

- **Aggregator registry:** `assetModules: AssetModule[]` where `AssetModule = { assetClass: 'gold'|'stock'|'crypto'; getSummary(userId): Promise<AssetSummary> }`. Now contains gold + stock adapters that call the existing `*.service.portfolio` and normalize. Adding Crypto = appending one adapter.
- **Snapshot:** daily cron `0 0 * * *` (gated by `ENABLE_PRICE_SCHEDULER`) runs `snapshotAllUsers()`; per-user `POST /dashboard/snapshot` for on-demand. Upsert on `(user_id, snapshot_date)`.
- **Growth:** derived from `portfolio_snapshots`; if a user has none yet, return a single current point computed live.
- **Reports monthly:** last snapshot per calendar month → AUM series + month-over-month delta (a proxy for performance, not realized P&L).
- **CSV:** built in-process (no dependency), UTF-8 with a BOM so Excel reads Vietnamese correctly.
- **Precision:** decimal.js for sums/percentages.
- **New deps:** web `recharts`. API reuses decimal.js/node-cron.

## API design (`apps/api/src/modules/dashboard`, `.../reports`)

### `dashboard/aggregator.ts`
```ts
interface HoldingLite { assetClass: AssetClass; label: string; value: Decimal | null; pnl: Decimal | null; pnlPct: Decimal | null; }
interface AssetSummary { assetClass: AssetClass; value: Decimal; invested: Decimal; pnl: Decimal; holdings: HoldingLite[]; }
type AssetClass = 'gold' | 'stock' | 'crypto';
```
- Gold adapter: call `goldService.portfolio(userId)`; map `totals` → value/invested/pnl; map each holding (`goldType` label, value, pnl, pnlPct).
- Stock adapter: call `stockService.portfolio(userId)`; same mapping (`symbol` label).
- `getAssetSummaries(userId): Promise<AssetSummary[]>` runs all registered adapters.
- Null `value`/`pnl` (missing price) treated as 0 in sums but preserved in holding rows.

### `dashboard/dashboard.service.ts`
- `summary(userId)` → `{ aum, invested, pnl, pnlPct, breakdown: [{ assetClass, value, pct, pnl }] }` (pct of AUM via `computeBreakdown`).
- `growth(userId, period: '7d'|'1m'|'3m'|'1y'|'all')` → `{ data: [{ date, value }] }` from snapshots in range; fallback to one live point.
- `recentTransactions(userId, limit=10)` → union of `gold_transactions` + `stock_transactions`, ordered `transactionAt desc`, mapped to `{ assetClass, title, subtitle, action, amount, date }` (amount = signed value estimate: qty×price, negative for buy).
- `topHoldings(userId, limit=5)` → flatten holdings across summaries, drop null-value, sort value desc.
- `topMovers(userId)` → holdings with non-null `pnlPct`, sorted → `{ gainers: top3, losers: bottom3 }`.
- `createSnapshot(userId)` → compute summaries, upsert today's `portfolio_snapshots` (totalValue, totalInvested, pnl JSON `{ [assetClass]: { value, invested, pnl } }`).

### `dashboard/snapshot.job.ts`
- `snapshotAllUsers()` → select all user ids, `createSnapshot` for each (sequential; MVP user counts are small). Logged.

### `reports/reports.service.ts`
- `pnlReport(userId, from?, to?)` → `{ byAsset: [{ assetClass, value, invested, pnl, pnlPct }], byMonth: [{ month, aum, delta }] }`. `byAsset` from current summaries; `byMonth` from last snapshot per month within range.
- `exportCsv(userId, module: 'gold'|'stock', from?, to?)` → CSV string of that module's transactions in range (columns per module). Uses `buildCsv`.
- `snapshotOn(userId, date)` → the `portfolio_snapshots` row for `date`, else the latest row with `snapshot_date <= date`, else null.

### Pure utils
- `lib/csv.ts`: `buildCsv(headers: string[], rows: (string|number)[][]): string` — quotes/escapes fields, joins with `\r\n`, prepends UTF-8 BOM.
- `dashboard/breakdown.ts`: `computeBreakdown(items: { key: string; value: Decimal }[]): { key: string; value: string; pct: string }[]` — pct of total (0 when total 0).

### Scheduler (modify `plugins/scheduler.ts`)
- When enabled, also register `cron.schedule('0 0 * * *', () => snapshotAllUsers()...)`; stop on close.

### Routes (replace stubs `dashboard.routes.ts`, `report.routes.ts`) — JWT-guarded
- `GET /dashboard/summary` → summary.
- `GET /dashboard/growth?period=1m` → growth.
- `GET /dashboard/recent-transactions?limit=10`.
- `GET /dashboard/top-holdings?limit=5`.
- `GET /dashboard/top-movers`.
- `POST /dashboard/snapshot` → `{ snapshotDate }`.
- `GET /reports/pnl?from=&to=` → report.
- `GET /reports/export/csv?module=gold&from=&to=` → `text/csv` with `Content-Disposition: attachment`.
- `GET /reports/snapshot?date=YYYY-MM-DD` → snapshot row or 404.

## Web design (`apps/web`)

### deps + clients
- Add `recharts`.
- `features/dashboard/dashboard.api.ts`: `getSummary`, `getGrowth(period)`, `getRecentTransactions`, `getTopHoldings`, `getTopMovers`, `createSnapshot`.
- `features/reports/reports.api.ts`: `getPnlReport(from,to)`, `exportCsv(module,from,to)` (returns blob → triggers download), `getSnapshot(date)`.

### `/dashboard` — DashboardPage (replace placeholder; mirrors the Stitch "Premium Cockpit")
- Header: "Tổng quan" + a "Chụp snapshot" button (`createSnapshot`).
- KPI row: Tổng AUM, Tổng vốn, P&L (value + %ROI, colored), Cash (0 đ placeholder).
- Growth `AreaChart` (Recharts) with period tabs (7d/1m/3m/1y/All).
- Allocation `PieChart` donut with asset-class colors (gold amber, stock blue, crypto violet, cash slate) + legend.
- Recent transactions list; Top holdings list (allocation bars); Top movers (gainers/losers) mini list.
- Empty state when AUM = 0.

### `/reports` — ReportsPage (replace placeholder)
- Period selector (custom from/to + quick Tháng/Quý/Năm).
- P&L by-asset cards/`BarChart`; monthly AUM `BarChart` from `byMonth`.
- Export CSV: module selector + range → download.
- Snapshot viewer: date picker → shows AUM/invested/pnl of that past date.

## Data flow

```
Summary:   GET /dashboard/summary → aggregator(gold+stock) → sums + breakdown
Growth:    GET /dashboard/growth → read portfolio_snapshots (range) → series (fallback live point)
Snapshot:  cron 0 0 * * * → snapshotAllUsers → per user aggregator → upsert portfolio_snapshots
Reports:   GET /reports/pnl → byAsset (live) + byMonth (snapshot month-ends)
CSV:       GET /reports/export/csv → module txs in range → buildCsv → attachment
```

## Components & boundaries

| Unit | Does | Depends on |
|---|---|---|
| `aggregator.ts` | normalize module portfolios into AssetSummary | gold.service, stock.service |
| `dashboard.service.ts` | summary/growth/recent/top/snapshot | aggregator, db, breakdown |
| `snapshot.job.ts` | snapshot all users | dashboard.service, db |
| `reports.service.ts` | pnl report, csv, snapshot view | aggregator, db, csv |
| `lib/csv.ts`, `breakdown.ts` | pure helpers | decimal.js |
| `*.routes.ts` | HTTP + guard | services |
| web pages | UI | dashboard/reports api, recharts |

## Testing

- **Pure unit (no DB):**
  - `buildCsv`: escapes commas/quotes/newlines, BOM prefix, CRLF rows.
  - `computeBreakdown`: pct sums to 100 for non-zero total; 0 when total 0.
  - growth mapping helper: maps snapshot rows → `{date,value}` and applies the live-fallback when empty.
- **Integration (DB-gated):** register → add a gold buy + a stock buy → `GET /dashboard/summary` aum = sum, breakdown has gold+stock; `POST /dashboard/snapshot` then `GET /dashboard/growth` returns ≥1 point and `GET /reports/snapshot?date=today` returns the row; `GET /reports/export/csv?module=gold` returns text/csv with a header line.
- Coverage focus: `csv` + `breakdown`.

## Acceptance criteria

- [x] `GET /dashboard/summary` AUM/invested/P&L equal the sum of Gold + Stock portfolios; breakdown % sums to 100.
- [x] Daily snapshot job (when enabled) and `POST /dashboard/snapshot` upsert one row per user per day.
- [x] `GET /dashboard/growth` returns a snapshot-based series (or a single live point when no history).
- [x] Recent transactions merge gold + stock, newest first; top holdings/movers correct.
- [x] `GET /reports/export/csv` returns valid UTF-8 CSV (BOM) for the chosen module + range.
- [x] `GET /reports/snapshot?date=` returns the portfolio state for a past date.
- [x] `/dashboard` + `/reports` functional with Recharts area/donut/bar.
- [x] `pnpm --filter @finfolio/api test` green; pure tests pass without a DB.

## Out of scope (restated)

VN-Index compare, AI alerts, cash tracking, realized monthly P&L, Crypto aggregation (until Phase 4), git/CI.
