# Phase 3 — Stock Module — Design

> **Date:** 2026-06-08
> **Phase:** 3 (Stock)
> **Status:** Approved for planning
> **Phase doc:** [../../phases/phase-3-stock.md](../../phases/phase-3-stock.md)

## Scope

Stock transaction CRUD (incl. dividends) + average-cost (WAVG) + fee/tax engine + unrealized P&L +
a pluggable market-data source (symbols, prices, OHLC) with scheduled refresh, plus the `/stocks`
portfolio, `/stocks/add` form, and `/stocks/$symbol` candlestick detail screens.

**In scope (SRS FR-STOCK-01..14):**
- CRUD stock transactions with validation (HOSE lot rules, sell ≤ held), filter + pagination.
- `stockMath` engine: WAVG cost, stock-dividend cost-basis adjustment, cash-dividend income, unrealized P&L, fee/tax computation.
- `MarketDataProvider` abstraction + a seed impl: symbol master (static), prices into `price_cache`, synthetic OHLC. Scheduler refreshes stock prices.
- Web: `/stocks` portfolio, `/stocks/add`, `/stocks/$symbol` detail with candlestick (lightweight-charts).
- Unit tests for the engine + schema; DB-gated integration tests.

**Deferred:**
- Real HOSE/HNX price feed + VSD/SSI symbol import + real OHLC (interface built now; real provider later).
- Realized P&L on sells (unrealized only).
- Auto dividend sync from VSD (the `dividend_events` table stays unused this phase; dividends are entered as transactions).
- Watchlist persistence (portfolio page may show a static sample watchlist; no CRUD).

**Not changing:** DB schema — `stock_transactions` and `price_cache` already exist; no new tables/columns. `stockActionEnum = ['buy','sell','cash_dividend','stock_dividend']`, `exchangeEnum = ['HOSE','HNX','UPCOM']`, `quantity` is integer.

## Decisions

- **Cost method:** average cost (WAVG), not FIFO (stocks differ from gold).
- **P&L:** unrealized only on holdings; **dividend income tracked separately** (capital P&L vs dividend distinguished).
- **Dividend modelling (FR-STOCK-14):**
  - `cash_dividend`: income `= quantity × price` (quantity = shares, price = cash/share). No qty/cost change.
  - `stock_dividend`: `quantity` = bonus shares received at price 0 → holding qty increases, total cost unchanged (avg cost drops).
- **Symbol master:** a static TS constant `STOCK_SYMBOLS` (`{ symbol, exchange, name }`). Autocomplete + validation source. Unknown symbols allowed (uppercased) for flexibility; exchange auto-detected from the master, overridable.
- **Market data:** `SeedMarketDataProvider` seeds prices into `price_cache (asset_type='stock')` and returns synthetic OHLC; real provider later.
- **Scheduler:** extend the Phase 2 scheduler plugin to also refresh stock prices (`*/5 * * * *`, same `ENABLE_PRICE_SCHEDULER` gate). (SRS says 1-min intraday; with a static seed the interval is cosmetic — `*/5` avoids log spam.)
- **Precision:** decimal.js for all money math.
- **New deps:** web `lightweight-charts`. (API reuses decimal.js/node-cron from Phase 2.)

## Fee/tax rules (FR-STOCK-06)

Defaults (overridable per transaction):
- Buy: brokerage = `0.15% × qty × price`; tax = 0.
- Sell: brokerage = `0.15% × qty × price`; tax = `0.1% × qty × price` (SRS §10.1-C — on sale value regardless of P&L).
- Dividends: brokerage = 0, tax = 0.
- If the request supplies `brokerageFee`/`tax` explicitly, those win; otherwise the server computes the defaults.

## Lot rules (FR-STOCK-04)

- `HOSE`: `quantity` must be a positive multiple of 100 (min 100) for `buy`/`sell`.
- `HNX`/`UPCOM`: `quantity ≥ 1` for buy/sell.
- Dividend actions: `quantity ≥ 1`, no multiple-of-100 rule.

## API design (`apps/api/src/modules/stock`)

### `stockMath.ts` (pure, decimal.js)
- `StockTx = { action: 'buy'|'sell'|'cash_dividend'|'stock_dividend'; quantity: number; price: string|number; brokerageFee: string|number; tax: string|number; transactionAt: Date }`.
- `computeHolding(txs: StockTx[]): { qty: Decimal; avgCost: Decimal; investedRemaining: Decimal; dividendIncome: Decimal; realizedFees: Decimal }`
  Running average-cost over time-ordered txs:
  1. `buy`: `qty += q`; `cost += q×price + brokerageFee + tax`.
  2. `stock_dividend`: `qty += q`; cost unchanged.
  3. `sell`: `avg = qty>0 ? cost/qty : 0`; `cost -= avg×q`; `qty -= q` (floored at 0). (Sell fees/tax do not change remaining cost basis; they reduce sale proceeds — out of scope for unrealized P&L.)
  4. `cash_dividend`: `dividendIncome += q×price`.
  `avgCost = qty>0 ? cost/qty : 0`; `investedRemaining = cost`.
- `unrealizedPnl(qty, avgCost, currentPrice): { pnl: Decimal; pnlPct: Decimal }` — `(currentPrice − avgCost)×qty`; pct vs `avgCost×qty` (0 when basis 0).
- `computeStockFees(action, qty, price, rates?): { brokerageFee: Decimal; tax: Decimal }` with defaults `{ buyBrokerage: 0.0015, sellBrokerage: 0.0015, sellTax: 0.001 }`.
- `heldQty(txs)` helper (for the sell-guard) = `computeHolding(txs).qty`.

### `stock.symbols.ts`
- `STOCK_SYMBOLS: { symbol: string; exchange: 'HOSE'|'HNX'|'UPCOM'; name: string }[]` — ~20 well-known tickers (FPT, MWG, VNM, HPG, VCB, ... on HOSE; SHS, PVS on HNX; etc.).
- `findSymbol(code): entry | undefined`; `searchSymbols(q, limit=10)`.

### `stock.schema.ts` (Zod)
- `createStockTxSchema`: `symbol: string(1..10)→uppercase`, `exchange: enum.optional` (auto-detected if omitted), `action: enum`, `quantity: int>0`, `price: number≥0`, `brokerageFee: number≥0 optional`, `tax: number≥0 optional`, `broker: string(≤80).optional`, `transactionAt: date optional`. A `.superRefine` enforces the HOSE lot rule (needs exchange resolved — see service note).
- `updateStockTxSchema`: partial, ≥1 required.
- `listStockTxQuerySchema`: `symbol?`, `action?`, `from?`, `to?`, `page`, `limit` (same shape as gold).
- `ohlcQuerySchema`: `range: enum('1m'|'3m'|'6m').default('3m')`.
- Response schemas: `stockTxSchema`, `stockPortfolioSchema`, `stockPricesSchema`, `ohlcSchema`, `symbolSchema`.

> **Lot-rule placement:** because the exchange may be auto-detected, the definitive HOSE multiple-of-100 check runs in the **service** after resolving the exchange (schema enforces `quantity > 0` integer; service enforces lot rule + sell-guard and throws `StockError(400, ...)`).

### `stock.service.ts`
- `searchSymbols(q)` → from `STOCK_SYMBOLS`.
- `list(userId, query)` → paginated, `transaction_at desc`.
- `create(userId, body)`:
  1. Uppercase symbol; resolve exchange (`body.exchange ?? findSymbol(symbol)?.exchange ?? 'HOSE'`).
  2. Lot rule: if exchange `HOSE` and action in {buy,sell} → require `quantity % 100 === 0`.
  3. Fees: if `brokerageFee`/`tax` omitted → `computeStockFees(action, qty, price)`.
  4. Sell-guard: if `sell`, load txs for `(user, symbol)`, `heldQty`, reject `q > held`.
  5. Insert; return row.
- `update` / `remove` — ownership-checked; recompute on read.
- `portfolio(userId)` — group by `symbol`; `computeHolding`; current price from `price_cache (stock, symbol)`; rows `{ symbol, exchange, qty, avgCost, currentPrice, value, weightPct, pnl, pnlPct, dividendIncome }` + totals `{ value, invested, pnl, pnlPct, dividendIncome }`. Missing price → null P&L, flagged.
- `prices()` — `price_cache` rows asset_type='stock' + most-recent `fetched_at` + stale (>20m... but stock is intraday; use a 5-min stale threshold).
- `ohlc(symbol, range)` — delegate to provider.

### Market data + scheduler
- `market/MarketDataProvider.ts`: `interface MarketDataProvider { fetchStockPrices(): Promise<StockQuote[]>; fetchOhlc(symbol, range): Promise<Candle[]> }`. `StockQuote = { symbol, price: string, currency: 'VND', source }`. `Candle = { time: string(YYYY-MM-DD), open, high, low, close }`.
- `market/SeedMarketDataProvider.ts`: prices = seed map for the master symbols (VND/share); OHLC = deterministically generated series for `range` (e.g. random-walk seeded by symbol hash so it is stable). Implements the interface; real provider later.
- `market/refreshStockPrices.ts`: `refreshStockPrices(provider)` → upsert quotes into `price_cache` (`onConflict (asset_type, symbol)`, `price_buy = price_sell = price`, `fetched_at = now`). Returns count.
- `plugins/scheduler.ts` (modify): also schedule `refreshStockPrices(new SeedMarketDataProvider())` on `*/5 * * * *` when enabled; stop on close.

### Routes (`stock.routes.ts`, replace stub) — all JWT-guarded
- `GET /stocks/symbols?q=` → `{ symbols: [...] }`.
- `GET /stocks/transactions` (query) → list.
- `POST /stocks/transactions` → 201 `{ transaction }`.
- `PUT /stocks/transactions/:id` → 200.
- `DELETE /stocks/transactions/:id` → 204.
- `GET /stocks/portfolio` → `{ holdings, totals }`.
- `GET /stocks/prices` → `{ prices, updatedAt, stale }`.
- `GET /stocks/:symbol/ohlc?range=3m` → `{ candles, markers }` (markers = the user's buy/sell dates+prices for that symbol).
- `POST /stocks/prices/refresh` → `{ refreshed }`.

## Web design (`apps/web`)

### `features/stock/stock.api.ts`
Typed client mirroring the endpoints: `searchSymbols`, `listStockTx`, `createStockTx`, `updateStockTx`, `deleteStockTx`, `getStockPortfolio`, `getStockPrices`, `getStockOhlc(symbol, range)`.

### `features/stock/fees.ts`
Client port of `computeStockFees` (default rates) for the add-form live breakdown.

### `/stocks` — StockPortfolioPage (replace placeholder)
- Header: title + "Giá delay 15 phút" info badge + "+ Thêm giao dịch".
- KPI cards: giá trị danh mục, tổng vốn, P&L (%ROI) + a "Cổ tức đã nhận" stat.
- Holdings table: Mã (+ exchange tag, links to detail) · SL · Giá vốn WAVG · Giá hiện tại · Giá trị · %Tỷ trọng · P&L · %P&L · Cổ tức. Mono, P&L colored.
- Live-price panel + stale dot. Static sample watchlist strip (no CRUD).
- Empty state.

### `/stocks/add` — StockAddPage (replace placeholder)
- Symbol input with autocomplete (`searchSymbols`), uppercased; exchange tag auto-fills (editable).
- Action dropdown (Mua/Bán/Cổ tức tiền/Cổ tức CP); quantity (int; HOSE ×100 hint); price (đ/CP, "Dùng giá hiện tại" from prices); fee/tax live breakdown via `fees.ts` (editable override); broker; datetime; T+2 note.
- Submit → `createStockTx` → invalidate `['stock']` → navigate `/stocks`. Server errors surfaced.

### `/stocks/$symbol` — StockDetailPage (new route under appRoute)
- Header: symbol + name + exchange tag + current price + ±chip.
- **Candlestick** (lightweight-charts) from `getStockOhlc` with buy ▲ / sell ▼ markers.
- "Vị thế của bạn" card (SL, WAVG, giá trị, P&L %ROI, cổ tức) from portfolio holding.
- "Lịch sử cổ tức" + "Giao dịch của mã" mini tables from `listStockTx({ symbol })`.

## Data flow

```
Add:       StockAddPage → POST /stocks/transactions → service (exchange resolve, lot rule, fees, sell-guard) → row
Portfolio: GET /stocks/portfolio → group by symbol → computeHolding + price_cache → holdings + totals
Detail:    GET /stocks/:symbol/ohlc → provider candles + user trade markers → chart
Prices:    cron */5 → SeedMarketDataProvider.fetchStockPrices → upsert price_cache(stock)
```

## Components & boundaries

| Unit | Does | Depends on |
|---|---|---|
| `stockMath.ts` | WAVG, dividends, P&L, fees (pure) | decimal.js |
| `stock.symbols.ts` | symbol master + search (pure) | — |
| `stock.service.ts` | CRUD, exchange resolve, lot rule, sell-guard, portfolio | db, stockMath, symbols |
| `stock.schema.ts` | Zod I/O | zod |
| `stock.routes.ts` | HTTP + guard | stock.service, market |
| `market/*` | provider interface + seed impl + price upsert + OHLC | db |
| `plugins/scheduler.ts` | gold + stock cron | node-cron, market, gold/price |
| web `stock.api.ts` / pages | UI | lib/api, lightweight-charts, router |

## Testing

- **Pure unit (no DB):** `stockMath`
  - `computeHolding`: single buy (qty/avg/cost incl fees); two buys WAVG; sell reduces qty, avg unchanged; stock_dividend raises qty + lowers avg (cost unchanged); cash_dividend adds income only; full sell → qty 0, avg 0.
  - `computeStockFees`: buy (0.15%, tax 0); sell (0.15% + 0.1% tax); dividends (0/0).
  - `unrealizedPnl`: gain/loss/zero.
  - `stock.symbols`: `findSymbol`, `searchSymbols` prefix/case-insensitive.
- **Schema tests:** create accepts valid; rejects qty ≤0/non-int, bad action/exchange; update empty rejected; ohlc range default.
- **Integration (DB-gated):** register → buy 100 FPT → portfolio shows holding + WAVG; HOSE buy of 150 → 400 (lot rule); sell > held → 400; stock_dividend raises qty; refresh → prices; `GET /:symbol/ohlc` returns candles.
- Coverage focus: `stockMath` near-100%.

## Acceptance criteria

- [x] WAVG, stock-dividend cost adjustment, cash-dividend income, and fees match hand-computed fixtures.
- [x] Sell tax = 0.1% of sale value; buy/sell brokerage = 0.15%; auto-computed when omitted, overridable.
- [x] HOSE buy/sell quantity must be a multiple of 100 (min 100); other exchanges min 1.
- [x] Sell exceeding holdings → 400.
- [x] `GET /stocks/portfolio` groups by symbol with capital P&L + dividend income + %weight + totals.
- [ ] `/stocks`, `/stocks/add`, `/stocks/$symbol` (candlestick + markers) functional against the API.
- [x] Scheduler refreshes stock prices when enabled; manual refresh works; stale flag shown.
- [x] `pnpm --filter @finfolio/api test` green; engine tests pass without a DB.

## Out of scope (restated)

Real price/OHLC feed, VSD symbol import + auto dividend sync, realized P&L, watchlist CRUD, Redis, git/CI.
