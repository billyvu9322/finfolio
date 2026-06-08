# Phase 2 — Gold Module

> Gold CRUD + DCA engine + gold-price crawler. First full vertical slice; the pattern Stock & Crypto reuse.

## Goal

User records gold buy/sell transactions, sees live SJC/PNJ/DOJI buy-back prices, and gets
accurate weighted-average cost (DCA) + unrealized P&L per holding.

## Delivers (SRS)

FR-GOLD-01..13 · §10.1-A (WAVG/DCA) · §10.1-B (P&L) · §10.2 (unit conversion).

## Tasks

### API
- [ ] `gold.service`: create / update / delete transaction with validation (sell ≤ held). (FR-GOLD-01..06,08,13)
- [ ] Unit conversion Chỉ/Lượng/Cây ↔ canonical (store in Chỉ). (§10.2)
- [ ] **DCA engine** (FR-GOLD-10): `DCA = Σ(qty×price + fee)/Σqty`, exclude sold (FIFO order); recompute on any change. **Unit-tested.**
- [ ] **P&L** (FR-GOLD-11): `(buyback − DCA) × held`, %ROI. Unit-tested.
- [ ] Storage location field (Nhà / Ngân hàng+tên / Online). (FR-GOLD-07)
- [ ] Endpoints: `GET/POST/PUT/DELETE /gold/transactions` (+filter loại/hành động/khoảng-thời-gian, pagination 20). (FR-GOLD-12)
- [ ] `GET /gold/portfolio` → holdings + DCA + P&L + total. `GET /gold/prices`.
- [ ] **Price crawler** (FR-GOLD-09): scheduled job every 15m parsing SJC/PNJ/DOJI → `price_cache`; fallback to last cached; expose `fetched_at`. Circuit breaker.
- [ ] Replace `gold.routes.ts` stub.

### Web
- [ ] `/gold` portfolio: KPI cards, live-price panel (stale dot), holdings table (mono, P&L colored), history table + filters + pagination.
- [ ] `/gold/add` form (FR-GOLD-01..08): gold-type dropdown, Mua/Bán segmented, qty + unit selector (auto-convert), price (auto-fill market), fee, datetime, storage, note; live DCA/P&L preview.
- [ ] Edit/Delete with recompute-confirm dialog.
- [ ] Empty state ("Chưa có giao dịch vàng…").

## Acceptance criteria

- [ ] DCA & P&L match hand-calculated fixtures (incl. partial sells). Tests green.
- [ ] Unit auto-conversion correct (1 Cây = 10 Chỉ = 375g).
- [ ] Crawler populates `price_cache` ≤15m; UI shows timestamp + stale fallback.
- [ ] Sell exceeding holdings rejected.
- [ ] Calc module coverage ≥ 70%.
