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
- [ ] Aggregation service: roll up AUM, invested, P&L, breakdown across all 3 modules. (FR-DASH-01..03)
- [ ] `GET /dashboard/summary` → aum, invested, pnl, breakdown. (FR-DASH-01..04)
- [ ] `GET /dashboard/growth?period=` → AUM time-series (7d/1m/3m/1y/all); optional VN-Index compare. (FR-DASH-05)
- [ ] Daily **snapshot job** → `portfolio_snapshots` (total_value, invested, pnl JSON). Powers growth + FR-RPT-02.
- [ ] Top gainers/losers (FR-DASH-06); featured AI alerts slot (placeholder, P2) (FR-DASH-07).
- [ ] Reports: `GET /reports/pnl?from=&to=` → summary + by_asset + by_month (realized vs unrealized; tax note 0.1%). (FR-RPT-03)
- [ ] `GET /reports/export/csv` → transaction history per module + range, `text/csv`. (FR-RPT-01)
- [ ] `GET /reports/snapshot?date=` → portfolio state on any past date. (FR-RPT-02)
- [ ] Replace `dashboard.routes.ts` + `report.routes.ts` stubs.

### Web
- [ ] `/dashboard` (Stitch "Premium Cockpit"): 4 KPI cards, performance area chart + range tabs (+VN-Index toggle), allocation donut + drill-down, market-watch strip, recent transactions, top holdings, upcoming events/alerts.
- [ ] `/reports`: period selector (Tháng/Quý/Năm + custom), P&L summary cards, bar chart by month, stacked-by-asset, breakdown table, Export CSV, snapshot date picker.
- [ ] Charts: Recharts (area/donut/bar) + Lightweight Charts (candlestick reused). Dark theme, asset colors.

## Acceptance criteria

- [ ] Dashboard totals reconcile exactly with sum of module portfolios.
- [ ] Donut drill-down navigates to the asset module.
- [ ] CSV opens correctly (UTF-8, VND/USD formatted) for a chosen range.
- [ ] Snapshot reproduces a past-date portfolio from stored data.
- [ ] Dashboard render < 1s on cached data (NFR 4.1).
