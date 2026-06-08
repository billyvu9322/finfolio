# Phase 7 — Exchange & Wallet Sync (post-MVP)

> Auto-import balances + trade history from crypto exchanges and on-chain wallets, instead of
> manual entry. **Post-MVP / Phase 2+ per SRS §9.2.** Not part of MVP v1.0 — scoped here so it
> isn't conflated with Phase 4 (manual crypto entry).

## Goal

A user links a **read-only** Binance account (then OKX/Bybit) and FinFolio pulls current balances
and historical trades, mapping them into the same crypto-transaction model from Phase 4 — no manual
typing. On-chain wallets (read by address) are a stretch goal.

## Important: NOT OAuth

Binance has no generally-available OAuth2 for retail accounts. "Login with Binance / Binance Connect"
is **partner-gated** (requires an approved partnership) — do not design around it. The realistic,
self-serviceable path is **user-generated read-only API keys (HMAC-SHA256)**:

- User creates an API key on Binance with **only "Enable Reading"** (never trade/withdraw), ideally
  IP-allowlisted.
- User pastes `apiKey` + `apiSecret`; backend signs requests with HMAC-SHA256.
- Reads: `GET /api/v3/account` (balances), `GET /api/v3/myTrades?symbol=` (fills) → map to FinFolio.

## Delivers

Extends FR-CRYPTO-06/11/12 (storage, per-wallet DCA, allocation) with automated sourcing.
New capability beyond SRS MVP scope.

## Tasks

### Data model
- [ ] `exchange_connections` table: `id, user_id, exchange (enum binance/okx/bybit), label,
      api_key_enc, api_secret_enc, scopes, status, last_sync_at, last_error, created_at`.
- [ ] `synced_trades` provenance: tag imported `crypto_transactions` with
      `source = 'binance' | 'manual'` + external `trade_id` for idempotent dedupe.

### Security (gate — do not ship without)
- [ ] Encrypt `api_secret` (and key) **at rest**: AES-256-GCM / libsodium sealed box; data key from
      env/KMS, **never** plaintext in DB or logs.
- [ ] Accept **read-only** keys only; on connect, probe key permissions and **reject/flag** if it has
      trade or withdraw rights.
- [ ] Never log secrets; redact in error paths. Secret returned to client only as masked `••••1234`.
- [ ] Per-connection rate-limit + circuit breaker (reuse the price-fetcher pattern); respect Binance
      weight limits + signed-request timestamp/recvWindow.

### Adapter layer (multi-exchange)
- [ ] `ExchangeAdapter` interface: `verifyKey()`, `fetchBalances()`, `fetchTrades(since)`,
      `normalize() → NewCryptoTransaction[]`. One impl per exchange (Binance first; OKX/Bybit differ
      in endpoints + signing).
- [ ] Binance adapter: HMAC signing, pagination over `myTrades` per symbol, map fills → buy/sell with
      fee + tx-time price; reconcile against existing manual entries.

### Sync engine
- [ ] On-demand sync (`POST /crypto/connections/:id/sync`) + scheduled incremental sync (cursor on
      `last_sync_at` / last `trade_id`).
- [ ] Idempotent upsert by `(exchange, trade_id)`; never double-count; surface `last_error` to UI.
- [ ] Recompute per-wallet DCA/P&L after import (reuse Phase 4 engine).

### Endpoints
- [ ] `POST /crypto/connections` (add key, verify read-only), `GET /crypto/connections`,
      `DELETE /crypto/connections/:id`, `POST /crypto/connections/:id/sync`.

### Web
- [ ] Settings → "Kết nối sàn": add Binance key form (with the read-only warning + how-to link),
      connection list (status, last sync, masked key), manual "Đồng bộ" + disconnect.
- [ ] Crypto portfolio: badge imported vs manual holdings; show last-sync timestamp + sync errors.

### Stretch — on-chain wallets
- [ ] Read balances by public address via RPC/Etherscan-class APIs (no API key) for ETH/EVM + BTC.
      Different model from exchange keys; separate adapter.

## Acceptance criteria

- [ ] Connecting a read-only Binance key imports balances + trade history, mapped to crypto
      transactions, with correct per-wallet DCA/P&L.
- [ ] A key with trade/withdraw permission is rejected (or hard-flagged) at connect time.
- [ ] Secrets are encrypted at rest and absent from logs (verified).
- [ ] Re-running sync produces zero duplicates (idempotent by `trade_id`).
- [ ] Binance API failure degrades gracefully (last data + error surfaced), circuit breaker trips.

## Risks / notes

- Each exchange = its own adapter (endpoints + signing differ); budget per-exchange effort.
- Binance endpoints/regions vary (.com vs regional); make base URL configurable.
- Custody/liability: read-only only — never request or store withdraw-capable credentials.
