# Phase 4 — Crypto Module — Design

> **Date:** 2026-06-08
> **Phase:** 4 (Crypto)
> **Status:** Approved for planning
> **Phase doc:** [../../phases/phase-4-crypto.md](../../phases/phase-4-crypto.md)

## Scope

Crypto transaction CRUD (incl. Swap) + per-(coin, wallet) WAVG cost + unrealized P&L (USD + VND) +
a pluggable crypto market-data + FX source, plus the `/crypto` portfolio and `/crypto/add` (with
Swap) web screens.

**In scope (SRS FR-CRYPTO-01..13):**
- CRUD crypto transactions with validation (sell ≤ held per coin+wallet), filter + pagination.
- `cryptoMath` engine: WAVG cost in VND, fee normalization, unrealized P&L.
- Swap endpoint → atomic sell(source) + buy(dest) pair valued by `valueVnd`.
- `CryptoDataProvider` abstraction + a seed impl (coin master, prices USD+VND + 24h change, FX USD/VND); manual FX override.
- Web: `/crypto` portfolio (per coin+wallet, USD+VND, 24h, wallet filter), `/crypto/add` (buy/sell/swap).
- Unit tests for the engine + schema; DB-gated integration tests.

**Deferred:**
- Real CoinGecko/CoinMarketCap prices + real ExchangeRate-API FX (interface built now; real provider + caching later).
- Realized P&L on sells/swaps (unrealized only).
- Staking/lending interest (Phase 2+ per SRS).

**Not changing:** DB schema — `crypto_transactions` already exists. `cryptoActionEnum = ['buy','sell','swap']`; `quantity numeric(30,8)`, `priceVnd` notNull, `priceUsd`/`usdVndRate` nullable, `fee numeric(30,8)`, `feeCurrency`, `wallet`. No new tables/columns.

## Key deviation from Gold/Stock pattern

Crypto reads the provider **live (in-process seed)** for current price + 24h change + FX, rather than
through `price_cache` + a scheduler. Rationale: the seed is a cheap local computation; there is nothing
to cache yet. **No crypto entry is added to `price_cache` and no crypto cron is registered.** When the
real CoinGecko/ExchangeRate provider is implemented later, caching + a refresh job can be added behind
the same `CryptoDataProvider` interface without touching callers.

## Decisions

- **Holding grouping:** by `(coinSymbol, wallet)` — one coin in two wallets = two positions (FR-CRYPTO-11/12).
- **Cost method:** average cost (WAVG) in **VND**; sells keep avg cost; unrealized P&L only.
- **Swap:** stored as two normal rows — source leg `action='sell'`, dest leg `action='buy'` — both at `priceVnd = valueVnd / qty`, same `wallet`, same `transactionAt`. The `'swap'` enum value is **not** written to stored rows (kept for possible future tagging). Created atomically in one DB transaction; the source leg is sell-guarded.
- **Multi-currency input:** request gives `price` + `priceCurrency` (`VND`|`USDT`) + optional `usdVndRate`; the service computes `priceVnd` (USDT × rate) and stores `priceUsd` + `usdVndRate`. The effective rate = `body.usdVndRate ?? provider FX`.
- **Fee normalization:** request gives `fee` + `feeCurrency` (`VND`|`USDT`|`COIN`). The service computes `feeVnd`: `VND → fee`; `USDT → fee × rate`; `COIN → fee × priceVnd`. Only buy legs fold fee into cost.
- **FX:** provider supplies USD/VND; a `?fx=` query param overrides it on portfolio/prices (FR-CRYPTO-10).
- **Precision:** decimal.js; quantity to 8 dp.

## API design (`apps/api/src/modules/crypto`)

### `cryptoMath.ts` (pure, decimal.js)
- `CryptoTx = { action: 'buy'|'sell'; quantity: string|number; priceVnd: string|number; feeVnd: string|number; transactionAt: Date }` (swap legs arrive as buy/sell).
- `computeHolding(txs): { qty: Decimal; avgCostVnd: Decimal; investedVnd: Decimal }`
  Running average cost: buy → `qty+=q`, `cost += q×priceVnd + feeVnd`; sell → `avg = qty>0?cost/qty:0`, `cost -= avg×q`, `qty -= q` (floored at 0). `avgCostVnd = qty>0?cost/qty:0`.
- `heldQty(txs): Decimal`.
- `unrealizedPnl(qty, avgCostVnd, currentPriceVnd): { pnl: Decimal; pnlPct: Decimal }` (VND).

### `crypto.coins.ts`
- `CRYPTO_COINS: { coinId: string; symbol: string; name: string }[]` (~20: bitcoin/BTC, ethereum/ETH, binancecoin/BNB, solana/SOL, ripple/XRP, cardano/ADA, dogecoin/DOGE, …).
- `findCoin(symbolOrId)`, `searchCoins(q, limit=10)`.

### `crypto.schema.ts` (Zod)
- `createCryptoTxSchema`: `coinId: string(1..80)`, `coinSymbol: string(1..20)→upper`, `action: 'buy'|'sell'`, `quantity: number>0` (≤8 dp), `price: number≥0`, `priceCurrency: 'VND'|'USDT' default 'VND'`, `usdVndRate: number>0 optional`, `fee: number≥0 default 0`, `feeCurrency: 'VND'|'USDT'|'COIN' default 'VND'`, `wallet: string(1..120)`, `transactionAt: date optional`.
- `swapBodySchema`: `sourceCoinId`, `sourceSymbol`, `sourceQty: number>0(≤8dp)`, `destCoinId`, `destSymbol`, `destQty: number>0(≤8dp)`, `valueVnd: number>0`, `wallet`, `transactionAt: date optional`.
- `updateCryptoTxSchema`: partial of create, ≥1 required.
- `listCryptoTxQuerySchema`: `coinSymbol?`, `wallet?`, `action?`, `from?`, `to?`, `page`, `limit`.
- `fxQuerySchema`: `fx: number>0 optional`.
- Response schemas: `cryptoTxSchema`, `cryptoPortfolioSchema`, `cryptoPricesSchema`, `coinSchema`.

### `crypto.service.ts`
- `coins(q)` → from master.
- `list(userId, query)` → paginated, `transaction_at desc`.
- `create(userId, body)`:
  1. Resolve `rate = body.usdVndRate ?? provider.fetchFxRate()`.
  2. `priceVnd = priceCurrency==='USDT' ? price×rate : price`; `priceUsd = priceCurrency==='USDT' ? price : priceVnd/rate`.
  3. `feeVnd` per feeCurrency rule (uses `priceVnd` for `COIN`).
  4. Sell-guard: if `sell`, load txs for `(user, coinSymbol, wallet)`, `heldQty`, reject `q > held`.
  5. Insert (store quantity, priceVnd, priceUsd, usdVndRate=rate, fee, feeCurrency, wallet).
- `update`/`remove` — ownership-checked.
- `swap(userId, body)`: in one `db.transaction`: sell-guard source `(coin, wallet)`; insert sell(source, priceVnd=valueVnd/sourceQty) + buy(dest, priceVnd=valueVnd/destQty); return both rows.
- `portfolio(userId, fxOverride?)`:
  - `quotes = provider.fetchPrices()` (map by symbol → {priceVnd, priceUsd, change24hPct}); `rate = fxOverride ?? provider.fetchFxRate()`.
  - Group txs by `(coinSymbol, wallet)`; `computeHolding` (feeVnd recomputed per stored tx via the same rule using stored priceVnd); rows `{ coinSymbol, wallet, qty, avgCostVnd, currentPriceVnd, valueVnd, valueUsd, pnlVnd, pnlPct, change24hPct, weightPct }` + totals `{ valueVnd, valueUsd, invested, pnl, pnlPct }`. Missing quote → null price/P&L.
- `prices(fxOverride?)` → `{ quotes: [...], fxRate }` from provider.

> **Fee recomputation on read:** stored rows keep `fee` + `feeCurrency`; the portfolio engine needs `feeVnd`. The service maps each stored tx → `CryptoTx` computing `feeVnd` from `fee`/`feeCurrency`/stored `priceVnd`/`usdVndRate`. This is deterministic from stored fields.

### Market data + FX provider
- `market/CryptoDataProvider.ts`: `interface CryptoDataProvider { fetchPrices(): Promise<CryptoQuote[]>; fetchFxRate(): Promise<number> }`; `CryptoQuote = { coinId, symbol, priceUsd: string, priceVnd: string, change24hPct: string, source }`.
- `market/SeedCryptoDataProvider.ts`: deterministic prices per coin (USD base from symbol hash), `change24hPct` deterministic, `fetchFxRate()` returns a fixed seed (e.g. `25000`). VND = USD × rate. Real provider later.

### Routes (`crypto.routes.ts`, replace stub) — JWT-guarded
- `GET /crypto/coins?q=` → `{ coins }`.
- `GET /crypto/transactions` (query) → list.
- `POST /crypto/transactions` → 201.
- `PUT /crypto/transactions/:id` → 200.
- `DELETE /crypto/transactions/:id` → 204.
- `POST /crypto/swap` → 201 `{ source, dest }`.
- `GET /crypto/portfolio?fx=` → `{ holdings, totals, fxRate }`.
- `GET /crypto/prices?fx=` → `{ quotes, fxRate }`.

## Web design (`apps/web`)

### `features/crypto/crypto.api.ts`
Typed client: `searchCoins`, `listCryptoTx`, `createCryptoTx`, `swap`, `getCryptoPortfolio(fx?)`, `getCryptoPrices(fx?)`.

### `/crypto` — CryptoPortfolioPage (replace placeholder)
- Header: title + FX chip "USD/VND: 25.000" with an override input + "+ Thêm giao dịch".
- KPI cards (USD + VND): Tổng giá trị, Tổng vốn, P&L (%ROI).
- Holdings table: Coin (symbol) · Ví/Sàn (slate tag) · SL · Giá vốn (VND) · Giá hiện tại · Giá trị (VND + USD) · 24h chip (green/red) · P&L · %P&L. Filter by wallet.
- Empty state.

### `/crypto/add` — CryptoAddPage (replace placeholder)
- Segmented: Mua / Bán / Swap.
- Buy/Sell: coin autocomplete (`searchCoins`), quantity (8 dp), price + VND/USDT toggle, fee + fee-currency selector, wallet dropdown (Binance/OKX/Bybit/MetaMask/Trust/Ledger/Khác), datetime (UTC / Asia-HCM).
- Swap: two panels Từ (coin nguồn + SL) → Đến (coin đích + SL) + `valueVnd` + wallet; caption "= 1 Bán + 1 Mua".
- Submit → `createCryptoTx` or `swap` → invalidate `['crypto']` → navigate `/crypto`.

## Data flow

```
Add:   CryptoAddPage → POST /crypto/transactions → service (rate resolve, priceVnd, feeVnd, sell-guard) → row
Swap:  CryptoAddPage(Swap) → POST /crypto/swap → db.transaction(sell source + buy dest) → 2 rows
Port:  GET /crypto/portfolio?fx= → provider.fetchPrices + fxRate → group (coin,wallet) → computeHolding → rows + totals
```

## Components & boundaries

| Unit | Does | Depends on |
|---|---|---|
| `cryptoMath.ts` | WAVG (VND) + P&L (pure) | decimal.js |
| `crypto.coins.ts` | coin master + search (pure) | — |
| `crypto.service.ts` | CRUD, swap (atomic), rate/fee normalize, sell-guard, portfolio | db, cryptoMath, provider, coins |
| `crypto.schema.ts` | Zod I/O | zod |
| `crypto.routes.ts` | HTTP + guard | crypto.service |
| `market/*` | provider interface + seed (prices/24h/FX) | — |
| web `crypto.api.ts` / pages | UI | lib/api, router |

## Testing

- **Pure unit (no DB):** `cryptoMath`
  - `computeHolding`: single buy (incl feeVnd); two buys WAVG; sell reduces qty, avg unchanged; full sell → qty 0, avg 0; 8-dp precision preserved.
  - `unrealizedPnl`: gain/loss/zero.
  - `crypto.coins`: `findCoin`, `searchCoins`.
- **Schema tests:** create accepts valid (uppercases symbol); rejects qty ≤0 / >8dp, bad action/currency; swap requires positive qtys + valueVnd; update empty rejected.
- **Integration (DB-gated):** register → buy 0.5 BTC on Binance → portfolio shows (BTC, Binance) holding; sell > held → 400; same coin on 2 wallets → 2 rows; swap BTC→ETH creates sell+buy and portfolio reflects both; `GET /crypto/prices` returns quotes + fxRate.
- Coverage focus: `cryptoMath` near-100%.

## Phase 5 hook

When this lands, add a `cryptoModule` adapter to `apps/api/src/modules/dashboard/aggregator.ts`
`assetModules` array (mapping `cryptoService.portfolio` totals/holdings to `AssetSummary` with
`assetClass: 'crypto'`, value in VND). No other dashboard change needed.

## Acceptance criteria

- [x] WAVG (VND), fee normalization (VND/USDT/COIN), and P&L match fixtures.
- [x] Holdings group by (coin, wallet); a coin in two wallets yields two positions.
- [x] Swap creates an atomic sell(source) + buy(dest) pair valued by `valueVnd`; portfolio reflects both.
- [x] Sell (and swap source) exceeding holdings → 400.
- [x] USDT price + USD/VND override convert correctly; portfolio shows USD + VND + 24h change.
- [x] `/crypto`, `/crypto/add` (buy/sell/swap) functional against the API.
- [x] `pnpm --filter @finfolio/api test` green; engine tests pass without a DB.

## Out of scope (restated)

Real price/FX feed + caching, realized P&L, staking/lending, on-chain wallet sync (Phase 7), git/CI.
