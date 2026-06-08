# Phase 4 — Crypto Module

> Crypto CRUD + Swap + per-wallet DCA + CoinGecko prices + USD/VND FX.

## Goal

User records crypto buys/sells/swaps across wallets/exchanges, sees live USD+VND prices,
24h change, and per-wallet weighted-average cost + P&L.

## Delivers (SRS)

FR-CRYPTO-01..13 · §5 (CoinGecko v3, ExchangeRate-API, fallback CoinMarketCap/Vietcombank).

## Tasks

### API
- [ ] Coin master: CoinGecko top-500 list for autocomplete + custom symbol. (FR-CRYPTO-01)
- [ ] `crypto.service`: create/update/delete; qty up to 8 decimals; price VND or USDT (auto-convert at tx-time FX). (FR-CRYPTO-03,04)
- [ ] Fee in coin (gas) or VND/USDT. (FR-CRYPTO-05)
- [ ] Storage wallet/exchange field (Binance/OKX/Bybit/MetaMask/Trust/Ledger/Khác). (FR-CRYPTO-06)
- [ ] **Swap** (FR-CRYPTO-07): source+dest → auto-generate Sell + Buy pair, atomic.
- [ ] **Per-wallet DCA + P&L** (FR-CRYPTO-11): WAVG separated per wallet/exchange; USD + VND. Unit-tested.
- [ ] **Live price** (FR-CRYPTO-09): CoinGecko 1-min poll (WS if available); USD+VND; fallback CoinMarketCap/last-cache; circuit breaker.
- [ ] **FX rate** (FR-CRYPTO-10): USD/VND hourly from ExchangeRate-API (fallback Vietcombank); manual override.
- [ ] 24h change (FR-CRYPTO-13). Endpoints: `GET/POST/PUT/DELETE /crypto/transactions`, `POST /crypto/swap`, `GET /crypto/portfolio`, `GET /crypto/prices`. Replace stub.

### Web
- [ ] `/crypto` portfolio: KPIs (USD+VND), holdings table + Ví/Sàn column + 24h chip, filter by wallet, FX-rate chip w/ override.
- [ ] `/crypto/add` form: Mua/Bán/Swap segmented; coin autocomplete; qty (8 dec); price VND/USDT toggle; fee selector; wallet; UTC/Asia-HCM datetime.
- [ ] Swap two-panel UI (Từ → Đến) with "= 1 Bán + 1 Mua" note. (Stitch screen exists.)

## Acceptance criteria

- [ ] Swap creates correct sell+buy pair; portfolio reflects both legs.
- [ ] Per-wallet DCA isolated; USD↔VND conversion uses tx-time rate.
- [ ] 8-decimal precision preserved (no float drift).
- [ ] CoinGecko failure → fallback + stale timestamp shown.
- [ ] Calc coverage ≥ 70%.
