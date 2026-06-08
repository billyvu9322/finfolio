# Phase 3 — Stock Module

> Stock CRUD + WAVG cost + fee/tax engine + live (15m-delay) prices + candlestick detail.

## Goal

User records VN stock trades (incl. dividends), sees per-symbol WAVG cost, fees/taxes, live
or 15m-delayed prices, portfolio weighting, and a 3-month candlestick with trade markers.

## Delivers (SRS)

FR-STOCK-01..14 · §10.1-C (sell tax 0.1%) · §5 (HOSE/HNX feed, VSD/SSI symbols).

## Tasks

### API
- [ ] Symbol master: import HOSE/HNX/UPCoM list (VSD/SSI iBoard), daily refresh, 7-day cache. (FR-STOCK-01, §5)
- [ ] `stock.service`: create/update/delete; validate symbol exists, qty multiple-of-100 for HOSE, min 100. (FR-STOCK-01,02,04)
- [ ] Action types Mua/Bán/Cổ tức tiền/Cổ tức CP. (FR-STOCK-03)
- [ ] **Fee/tax engine** (FR-STOCK-06): default 0.15% buy; 0.15% + 0.1% tax sell; auto-calc from rate; override.
- [ ] **WAVG engine** (FR-STOCK-10): weighted-avg cost; stock-dividend adjusts cost basis. Unit-tested.
- [ ] **P&L per symbol** (FR-STOCK-11): split capital gain vs dividend received. Unit-tested.
- [ ] Dividend recording (FR-STOCK-14): cash → income; stock → cost-basis adjust (`dividend_events`).
- [ ] **Live price** (FR-STOCK-09): HOSE/HNX feed, 1-min intraday refresh, closing price after hours; circuit breaker + cache.
- [ ] Endpoints: `GET/POST/PUT/DELETE /stocks/transactions`, `GET /stocks/portfolio`, `GET /stocks/prices`, `GET /stocks/:symbol/ohlc` (3-month). Replace stub.

### Web
- [ ] `/stocks` portfolio: KPIs, holdings table (symbol+logo+exchange tag, WAVG, value, %weight, P&L, sparkline), watchlist, 15m-delay badge.
- [ ] Stock detail drawer (FR-STOCK-13): 3-month candlestick + buy/sell markers + dividend history. (Stitch screen exists.)
- [ ] `/stocks/add` form (FR-STOCK-01..08): symbol autocomplete, exchange auto-detect, action, qty (×100 hint), price (auto close), fee/tax live breakdown, date (T+2 note), broker.

## Acceptance criteria

- [ ] WAVG + fee/tax + P&L match fixtures incl. stock-dividend adjustment. Tests green.
- [ ] HOSE qty enforces multiples of 100.
- [ ] Sell tax = sell value × 0.1% regardless of P&L.
- [ ] Live price refreshes ≤1m in session; closing price off-hours.
- [ ] Calc coverage ≥ 70%.
