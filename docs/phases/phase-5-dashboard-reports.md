# Phase 5 — Dashboard & Reports

> Cross-asset aggregation: dashboard KPIs + charts, P&L reports, CSV export, snapshots.

## Goal

The home dashboard aggregates Gold + Stock + Crypto into total AUM, P&L, allocation, and
growth; reports give monthly/quarterly/yearly P&L by asset (tax-friendly) with CSV export
and historical snapshots.

## Delivers (SRS)

FR-DASH-01..07 · FR-RPT-01..03 · §10.1 (formulas reused).

## Tasks

### API
- [x] Aggregation service: roll up AUM, invested, P&L, breakdown across all 3 modules. (FR-DASH-01..03)
- [x] `GET /dashboard/summary` → aum, invested, pnl, breakdown. (FR-DASH-01..04)
- [x] `GET /dashboard/growth?period=` → AUM time-series (7d/1m/3m/1y/all). (FR-DASH-05 partial; VN-Index deferred)
- [x] Daily **snapshot job** → `portfolio_snapshots` (total_value, invested, pnl JSON). Powers growth + FR-RPT-02.
- [x] Top gainers/losers (FR-DASH-06). (AI alerts slot deferred)
- [x] Reports: `GET /reports/pnl?from=&to=` → by_asset + by_month based on unrealized P&L/snapshot deltas. (FR-RPT-03 partial)
- [x] `GET /reports/export/csv` → transaction history per module + range, `text/csv`. (FR-RPT-01)
- [x] `GET /reports/snapshot?date=` → portfolio state on any past date. (FR-RPT-02)
- [x] Replace `dashboard.routes.ts` + `report.routes.ts` stubs.

### Web
- [x] `/dashboard`: 4 KPI cards, performance area chart + range tabs, allocation donut, recent transactions, top holdings, top movers. (VN-Index/drill-down/market-watch/upcoming alerts deferred)
- [x] `/reports`: custom period selector, P&L breakdown table, AUM bar chart, Export CSV, snapshot date picker. (quick Tháng/Quý/Năm + stacked chart deferred)
- [x] Charts: Recharts (area/donut/bar). Dark theme, asset colors.

## Acceptance criteria

- [x] Dashboard totals reconcile exactly with sum of module portfolios.
- [ ] Donut drill-down navigates to the asset module.
- [x] CSV opens correctly (UTF-8, VND/USD formatted) for a chosen range.
- [x] Snapshot reproduces a past-date portfolio from stored data.
- [ ] Dashboard render < 1s on cached data (NFR 4.1).
