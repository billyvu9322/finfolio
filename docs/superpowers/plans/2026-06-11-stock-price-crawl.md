# Stock Price Feed (real VN quotes) — Implementation Plan

> **STATUS: IMPLEMENTED.** API typecheck clean; 82 tests pass (3 `VciTickerProvider` unit tests added);
> web build clean. VCI endpoint + unit verified live (FPT close 73600 = VND, **no ×1000 scaling**).
> Tasks 1–6 done; charts now use VCI with Seed fallback. Not yet committed/redeployed.
>
> **Spec:** [../specs/2026-06-11-stock-price-crawl-design.md](../specs/2026-06-11-stock-price-crawl-design.md)
>
> **NO GIT this build.** "Commit" → **Checkpoint** (typecheck/test). Never run git.

**Goal:** Replace the stock seed prices with **real VCI/Vietcap quotes**, refreshing only held symbols,
so the Stock screen shows live `currentPrice` / value / P&L — mirroring how crypto uses Binance.

**Tech:** Node `fetch` (POST JSON), Drizzle, Zod, vitest. No headless browser. Pattern copied from
`crypto-price.service.ts` + `BinanceTickerProvider.ts`.

**Reference facts:**
- `MarketDataProvider` interface, `price_cache` (`asset_type='stock'`, `priceBuy=priceSell`),
  `stockService.getPortfolio` reads `pricesBySymbol` from `price_cache`. **No schema change.**
- Existing routes: `GET /stocks/prices`, `POST /stocks/prices/refresh` (currently `SeedMarketDataProvider`).
- Existing cron: `*/5 * * * *` `refreshStockPrices(stockProvider)` in `plugins/scheduler.ts`.
- VCI: `POST https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart`,
  body `{ timeFrame:"ONE_DAY", symbols:[...], to:<unix秒>, countBack:N }`, last `c` = current price.
  Headers: Referer/Origin `trading.vietcap.com.vn`, desktop UA, `Content-Type: application/json`.
- **×1000 scaling MUST be verified** against a live price before shipping (highest risk).

---

## Task 1: VCI ticker provider

**Files:** Create `apps/api/src/modules/stock/market/VciTickerProvider.ts`.

- [ ] `fetchVciQuotes(symbols: string[]): Promise<{ symbol: string; price: string }[]>`:
  - empty input → `[]`.
  - POST gap-chart with `symbols` array, `timeFrame:"ONE_DAY"`, `to: now秒`, `countBack: 5`.
  - Parse response → for each symbol take last `c`; apply scaling (`× 1000` pending verification);
    `price = String(Math.round(value))` (VND, integer).
  - Browser headers via a local `VCI_HEADERS` const.
  - On multi-symbol failure, retry per symbol; per-symbol error → skip + `console.warn` (no throw).
  - Throw only if the whole batch + all fallbacks fail.
- [ ] **Checkpoint (manual verify):** call once with `['FPT','VCB']`, compare to a known live price to
  lock the scaling factor. Record the confirmed factor in a code comment.

## Task 2: Stock price service (held-symbols refresh)

**Files:** Create `apps/api/src/modules/stock/stock-price.service.ts`.

- [ ] `refreshStockPrices()`: `selectDistinct symbol from stock_transactions`; none → `{ refreshed: 0 }`.
  Fetch via `fetchVciQuotes`, upsert `price_cache` (`assetType:'stock'`, `priceBuy=priceSell=price`,
  `source:'vci'`, `fetchedAt:now`) with `onConflictDoUpdate` on `(assetType, symbol)`.
- [ ] Keep return shape `{ refreshed: number }` to match the existing route.

## Task 3: Repoint routes + cron

**Files:** `apps/api/src/modules/stock/stock.routes.ts`, `apps/api/src/plugins/scheduler.ts`.

- [ ] `POST /stocks/prices/refresh` → call new `stockPriceService.refreshStockPrices()` (drop the
  `SeedMarketDataProvider` arg). Response `{ refreshed }` unchanged.
- [ ] Scheduler `*/5 * * * *` job → `stockPriceService.refreshStockPrices()` (dynamic import like the
  crypto job). Log refreshed count; errors non-fatal.

## Task 4: OHLC for charts (VCI) — keep behind interface

**Files:** `apps/api/src/modules/stock/market/VciMarketDataProvider.ts` (or extend provider).

- [ ] Implement `fetchOhlc(symbol, range)` via gap-chart (`timeFrame` from range, `countBack`=days),
  map `{t,o,h,l,c}` → `Candle`, apply same scaling. `fetchStockPrices()` may delegate to
  `fetchVciQuotes(STOCK_SYMBOLS)` for the full-list path.
- [ ] Swap `stock.service.ts` chart provider from Seed → VCI. **Fallback to Seed on failure** so charts
  never break. (Lower priority than Tasks 1–3; portfolio price is the user’s ask.)

## Task 5: Web — price card + refresh + trend (parity with crypto)

**Files:** `apps/web/src/features/stock/StockPortfolioPage.tsx` (+ `apis/stock.api.ts` if needed).

- [ ] Ensure a "Giá thị trường" card + **"Cập nhật giá"** button (calls `/stocks/prices/refresh`,
  invalidates queries) — mirror the crypto price card. Reuse if it already exists.
- [ ] Trend icon on `%P&L` (up green / down red) like crypto, and source/stale label.

## Task 6: Env + config + checks

**Files:** `apps/api/src/config/env.ts`, `docker-compose.yml`, root `.env.*`.

- [ ] `STOCK_PRICE_SOURCE` (default `vci`) + optional `VCI_BASE_URL` override; compose passthrough
  (beware empty-string `??` pitfall — only pass when set).
- [ ] Unit test `VciTickerProvider` parsing/scaling with a captured sample payload (mock `fetch`).
- [ ] API typecheck + crypto/stock tests + web build green. Update the spec/plan status to IMPLEMENTED.

---

## Known limits / follow-ups
- Unofficial VCI endpoint — keep SSI/DNSE as a documented fallback behind the interface.
- VN market closed nights/weekends → last close shown as current (stale flag stays); acceptable.
- Symbols not on VCI → `currentPrice = null` → table shows `-`.
