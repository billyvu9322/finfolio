# Crypto Binance Sync + Real FX + Portfolio UX — Change Log

> **STATUS: IMPLEMENTED.** API typecheck clean; 46 crypto/lib tests pass (3 integration suites skipped — need DB);
> web build (tsc -b + vite) clean. **Not yet committed; not yet redeployed** — single Docker image must be
> rebuilt for these to take effect in production.

> **Nature:** Retrospective note of work done in the 2026-06-11 session — hardens Phase 7 (exchange-sync)
> and polishes the crypto portfolio screen. Builds on
> [2026-06-08-phase7-exchange-sync.md](2026-06-08-phase7-exchange-sync.md) and
> [2026-06-08-crypto-ai-alert.md](2026-06-08-crypto-ai-alert.md).

**Context:** Real Binance connection now works, but sync returned no data, FX was a stub, and several
portfolio-screen UX issues surfaced. This session made sync reflect actual holdings (incl. Earn + margin),
replaced the fixed FX with a live rate, fixed precision/format bugs, and reworked the AI-alert + trend UX.

---

## 1. Real USD→VND FX rate (replaced fixed 25,000 stub)

**Files:** `apps/api/src/modules/crypto/market/FxRateProvider.ts` (new); swapped all `fetchFxRate()`
call sites in `crypto.service.ts`, `crypto-price.service.ts`, `exchange/connection.service.ts`.

- New `fetchUsdVndRate()` — `open.er-api.com` (free, no key) or `exchangerate-api.com` when
  `EXCHANGERATE_API_KEY` set. In-memory cache ~15 min; fallback chain stale-cache → `25000` on error.
- `SeedCryptoDataProvider.fetchFxRate` (constant `FX = 25000`) no longer on the live path — only stub
  coin prices/candles still use it.
- Frontend shows the live rate: `1 USDT ≈ <fxRate> ₫` next to the currency toggle.
- Verified live: ~26,236 ₫/USD.

## 2. USDT / VND currency toggle (portfolio screen)

**Files:** `apps/web/src/features/crypto/CryptoPortfolioPage.tsx`.

- Segmented `[USDT | VND]` toggle beside "+ Thêm giao dịch". `fmt()` branches: VND → raw `valueVnd`;
  USDT → `value ÷ fxRate`. Subtitle text follows the selection.

## 3. Sync = balance snapshot (Spot + Simple Earn + Margin)

**Files:** `apps/api/src/modules/crypto/exchange/{ExchangeAdapter,BinanceAdapter,MockExchangeAdapter}.ts`,
`exchange/connection.service.ts`.

**Root cause found:** old sync read only spot **trade history** (`/api/v3/myTrades`) gated by a 20-coin
whitelist + current balance. User's coins live in **Binance Simple Earn** (reported as synthetic
`LD<COIN>` assets, e.g. `LDXRP`) → nothing synced. The silent `.catch(() => [])` masked the real reason.

- New `ExchangeAdapter.fetchHoldings()` + `NormalizedHolding`. `BinanceAdapter.fetchHoldings`:
  reads `/api/v3/account` + `/api/v3/ticker/price`, sums per base symbol, values at live `<COIN>USDT`.
  No whitelist gate → PAXG, XRP, etc. all included.
- **Earn quantity fix (correction):** the first version read Earn from the `LD<COIN>` shadow assets in
  `/api/v3/account` — that's the **legacy Lending** view and returned wrong/dust amounts (XRP showed
  `1e-8`). Corrected to the dedicated **Simple Earn** endpoints:
  `/sapi/v1/simple-earn/flexible/position` (`rows[].totalAmount`) +
  `/sapi/v1/simple-earn/locked/position` (`rows[].amount`). `LD`-prefixed spot balances are now skipped
  to avoid wrong qty + double-counting. Both reads best-effort (403 → skip).
- **Flexible Loan collateral (further fix):** assets pledged as collateral for a Binance Flexible Loan
  leave the Earn/spot balances (flexible `totalAmount` excludes them → coin showed ~`1e-8` dust). Added
  `GET /sapi/v2/loan/flexible/ongoing/orders` → `add(collateralCoin, collateralAmount)`. Best-effort.
  `connection.service.sync` also now **deletes stale `balance:<coin>` rows** not in the new snapshot, so
  an earlier buggy sync's wrong quantity can't linger. Verbose per-source logging added to `fetchHoldings`.
- **Margin merged**: cross (`/sapi/v1/margin/account`) + isolated
  (`/sapi/v1/margin/isolated/account`), `netAsset > 0`. Best-effort — `403` (key without margin perm)
  is caught and skipped, never fails the sync.
- `connection.service.sync()` rewritten: upserts one synthetic `buy` per coin keyed
  `balance:<coin>` (`onConflictDoUpdate`) → re-sync updates in place, no duplicates. Cost basis =
  current price (exchange doesn't expose Earn cost). After snapshot, calls
  `cryptoPriceService.refreshCryptoPrices()` (non-fatal) so real prices populate immediately.
- `fetchTrades` kept for the interface/tests but no longer on the sync path.

**API key permission:** read-only ("Cho phép đọc") is sufficient — including margin reads. Margin only
appears if the Binance account actually has margin enabled.

## 4. Surface sync errors (no more silent failure)

**Files:** `exchange/BinanceAdapter.ts`, `exchange/connection.service.ts`,
`apps/web/src/features/crypto/ConnectionsSection.tsx`.

- Removed silent swallow; per-symbol errors logged + collected; throws a descriptive error when nothing
  syncable / all calls fail.
- `sync()` failure now throws `CryptoError(422, …)` (4xx → forwarded by the central error handler) and
  stores the reason in `lastError`.
- UI: sync toast shows the server message; `lastError` rendered whenever `status === "error"`.

## 5. Sync cron (status)

`plugins/scheduler.ts`: exchange-sync cron `*/30 * * * *` exists but is **OFF by default**, gated by
`ENABLE_EXCHANGE_SYNC_CRON`. Crypto **price** refresh cron is hourly under `ENABLE_PRICE_SCHEDULER`.

## 6. Quantity + price precision / format fixes

**Files:** `apps/api/src/modules/crypto/{crypto.service.ts,crypto-price.service.ts,crypto.schema.ts}`,
`apps/web/src/apis/crypto.api.ts`, `CryptoPortfolioPage.tsx`.

- **Qty `1e-8` bug:** `decimal.js .toString()` emitted scientific notation. New `qty()` formatter
  (≤8 dp, no exponential) on holdings + history.
- **Price mismatch (Danh mục vs panel/history):** portfolio round-tripped through 2-dp VND then showed
  2 dp. Backend now returns exact USD unit prices `avgCostUsd` + `currentPriceUsd` (from raw `priceUsd`,
  no VND round-trip); `CryptoQuoteLite` carries `priceUsd`. New `price()` formatter renders Giá vốn /
  Giá hiện tại at ≤8 dp (USD field in USDT mode, VND field in VND mode). Value/P&L/KPIs stay 2 dp.

## 7. AI alerts — batched JSON + inline severity icon

**Files:** `apps/api/src/modules/crypto/ai/{agentAlertProvider,aiAlert.service}.ts`, `CryptoPortfolioPage.tsx`.

- **Batched LLM:** new `generateBatch(contexts[])` — one call sends the whole portfolio as an array,
  returns `{ alerts: [{ coinSymbol, wallet, title, message }] }`, mapped back by `coinSymbol|wallet`.
  Severity always locally computed (LLM can't downgrade). `aiAlert.service` collects pending contexts →
  `generateAll` (batch when agent on, else per-coin rule). Missing coin → throw → rule fallback. 15-min cache kept.
- **UI:** removed the standalone "AI Cảnh báo" card. Severity icon now sits next to the coin in the
  Danh mục table (`AlertIcon`): critical → red `XCircle`, warning → amber `AlertTriangle`, info → none.
  Analysis shown as a **native `title` tooltip** (reliable inside the `overflow-x-auto` table where an
  absolute popover would be clipped). "Phân tích lại (AI)" moved to the Danh mục header.

## 8. Trend arrows

**Files:** `CryptoPortfolioPage.tsx`.

- `TrendIcon` — `TrendingUp` (green ≥0) / `TrendingDown` (red <0), hidden for null.
- Danh mục **%P&L**: arrow before the number. **Giá Coin (Binance)**: arrow beside the coin name
  (by `change24hPct`). Aligns with DESIGN.md (P&L = color + icon, not color alone).

## 9. Stale lazy-chunk crash fix ("Failed to fetch dynamically imported module")

**Files:** `apps/api/src/app.ts`, `apps/web/src/router.tsx`.

- After a redeploy the single image replaces `dist`; open tabs reference old hashed chunks. The SPA
  fallback also returned `index.html` for missing `/assets/*.js`, turning a 404 into a module-parse error.
- **Server:** SPA `setNotFoundHandler` now excludes `/assets/` → clean 404 for missing chunks.
- **Client:** `importWithReload()` wraps every lazy import → one `location.reload()` on chunk error
  (sessionStorage guard, no loop) to pull fresh `index.html` + new hashes.

---

## Deploy / config notes

- Added `ENCRYPTION_KEY` passthrough to `docker-compose.yml` `environment` (was missing → exchange
  connect failed with "ENCRYPTION_KEY must be base64-encoded 32 bytes"). Key already in `.env.production`.
- `EXCHANGERATE_API_KEY` optional passthrough kept; free FX endpoint works without it.
- **To enable 30-min auto-sync:** set `ENABLE_EXCHANGE_SYNC_CRON=true` (+ compose passthrough — not yet wired).
- Rebuild the single image (`docker compose --env-file .env.production up -d --build`) to apply.

## Follow-ups / known limits

- Snapshot cost basis = current price → initial P&L ≈ 0 (exchange gives no Earn cost basis).
- PAXG (gold token) appears in the **crypto** portfolio (it's a Binance coin), separate from the Gold module.
- If a coin has both manual txns and an exchange snapshot, quantities double-count (current users are Earn-only).
- Futures wallet (USDⓈ-M / COIN-M) not synced — different endpoints, out of scope.
- Rightmost AI/trend tooltips use the native browser tooltip; a JS popover lib would allow styled, auto-flipping tooltips.
