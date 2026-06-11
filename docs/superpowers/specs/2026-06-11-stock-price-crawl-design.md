# Stock Price Feed (real VN quotes) — Design

> **Date:** 2026-06-11
> **Status:** IMPLEMENTED (VCI verified live — prices already in VND, no ×1000 scaling needed)
> **Depends on:** Stock module (Phase 3) — `stock_transactions`, `stockService.getPortfolio/prices`,
> `MarketDataProvider` interface, `price_cache` (`asset_type='stock'`), the 5-min `refreshStockPrices`
> cron in `plugins/scheduler.ts`, and the Stock screen portfolio table.

## Goal

Show **real current prices** for held stocks in Quản lý Chứng khoán, exactly like Quản lý Crypto now
shows real Binance prices. Replace the `SeedMarketDataProvider` stub (deterministic fake prices) with a
real VN-market provider behind the **existing `MarketDataProvider` interface**, so portfolio
`currentPrice` / `value` / P&L / `%P&L` and the price card reflect the live market.

Today every stock price is seed-only (`basePrice(symbol)` = `20_000 + (hash%80)*1_000`), so valuation is
fake. This is the stock analogue of Phase 7 (crypto) + the gold-price-crawl feature.

## Why this mirrors crypto, not gold

The stock plumbing already matches crypto's: `MarketDataProvider` interface → `price_cache` rows →
`stockService.getPortfolio` reads `pricesBySymbol`. We only **swap the provider implementation** and
refresh **only the symbols the user holds** (like `crypto-price.service.refreshCryptoPrices` querying
distinct held coins). No schema change, no new table — `price_cache` already stores stock rows.

## Data source (verified 2026-06-11)

Primary: **VCI / Vietcap public trading API** — the default source in the `vnstock` library after TCBS
discontinued its public API. No key, no auth; needs browser-like headers.

| Use | Method + URL | Body | Response |
|-----|--------------|------|----------|
| OHLC / latest price | `POST https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart` | `{ "timeFrame": "ONE_DAY", "symbols": ["FPT"], "to": <unix秒>, "countBack": <N> }` | array of `{ symbol, t[], o[], h[], l[], c[], v[] }` — **last `c` = latest close = current price** |

- Headers required (VCI rejects bot-less requests): `Referer: https://trading.vietcap.com.vn/`,
  `Origin: https://trading.vietcap.com.vn`, `User-Agent: <desktop browser UA>`, `Content-Type: application/json`.
- **Batching:** `symbols` is an array — attempt all held symbols in one POST; if the API returns only the
  first / errors on multi-symbol, fall back to one POST per symbol (like `fetchBinanceTickers`’ loop).
- **Unit scaling — MUST VERIFY:** VCI OHLC values are widely reported to be in **thousand VND**
  (e.g. FPT close `≈ 120.5` meaning `120,500₫`). `vnstock` multiplies VCI prices by `1000`. The store
  unit here is **VND** (`price_cache.priceBuy`, `stock.avgCost` are VND). So the adapter must apply
  `× 1000` **after confirming against a known live price** (e.g. FPT/VCB on a trading day). Getting this
  wrong makes P&L off by 1000×. This is the single highest-risk detail — verify before shipping.
- **OHLC for charts** (`fetchOhlc`): same endpoint with `timeFrame` mapped from `1m/3m/6m` and
  `countBack` = day count; map `{t,o,h,l,c}` → existing `Candle`.

### Fallbacks (design only; implement primary first)
- **SSI iBoard** (`https://iboard-api.ssi.com.vn/...`) and **DNSE** are alternative free JSON sources if
  VCI changes. Keep the provider behind the interface so a fallback can be added without touching callers.
- A `STOCK_PRICE_SOURCE` env (default `vci`) lets us switch sources later.

## Behaviour

- **Refresh only held symbols.** New `stock-price.service.refreshStockPrices()` selects
  `distinct symbol from stock_transactions`, fetches VCI quotes for those, upserts `price_cache`
  (`asset_type='stock'`, `priceBuy=priceSell=price`, `source='vci'`). None held → no network call
  (mirrors `crypto-price.service`).
- **Staleness.** `stockService.prices` already flags `stale` when cache older than `STALE_MS`. VN market
  is closed nights/weekends → last close is the correct "current price" then; keep the stale flag but
  treat last close as valid (don't error).
- **Market hours.** Outside 09:00–15:00 ICT trading, gap-chart still returns the last session’s close —
  acceptable as current price. No special-casing required.
- **Symbols not on VCI / unmatched** → no price row → portfolio shows `currentPrice = null` (table already
  renders `-`), same as crypto coins without a USDT pair.
- **Failure** is non-fatal: a fetch error logs + leaves the previous cached price (cron retries in 5 min).

## Cron

Reuse the existing `*/5 * * * *` `refreshStockPrices` job in `schedulerPlugin` (gated by
`ENABLE_PRICE_SCHEDULER`) — repoint it at the held-symbols refresh. Optionally narrow the schedule to
trading days/hours later; not required for v1.

## Out of scope

- Intraday tick / order book, foreign room, bid-ask depth.
- Index values (VNINDEX/VN30) beyond what charts need.
- Real-time websocket streaming — polling every 5 min is sufficient, matching crypto.

## Risks

1. **×1000 scaling** (see above) — verify against a live price first.
2. **Unofficial endpoint** — VCI may change shape/headers; isolate in the provider + keep SSI/DNSE fallback path.
3. **Rate limiting** — only fetch held symbols, batch where possible, cache 5 min.
4. **Region** — server must reach `trading.vietcap.com.vn` (VN host). Confirm outbound from the deploy box.
