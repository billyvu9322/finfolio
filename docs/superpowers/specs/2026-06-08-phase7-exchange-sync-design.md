# Phase 7 — Exchange & Wallet Sync — Design

> **Date:** 2026-06-08
> **Phase:** 7 (post-MVP) — Exchange sync
> **Status:** Approved for planning
> **Phase doc:** [../../phases/phase-7-exchange-sync.md](../../phases/phase-7-exchange-sync.md)
> **Depends on:** Phase 4 (Crypto) implemented (`crypto_transactions`, `cryptoService.portfolio`, FX from `CryptoDataProvider`).

## Goal

Let a user link a **read-only** Binance account (API key + secret) and import balances + trade
history into the existing `crypto_transactions`, so portfolio/DCA/P&L reflect them automatically —
**no manual entry, no OAuth** (Binance OAuth is partner-gated). On-demand sync now; optional cron later.

## Decisions (from clarifications)

- **Adapter:** real `BinanceAdapter` (HMAC-SHA256 signed REST) behind an `ExchangeAdapter` interface; a `MockExchangeAdapter` drives unit/integration tests (no network). Real calls are network-gated/manual.
- **Storage:** extend `crypto_transactions` with `source` + `externalTradeId`; imported trades become normal rows (portfolio/DCA include them). Dedupe via a partial unique index `(user_id, source, external_trade_id)`.
- **Secret at rest:** **AES-256-GCM** with `ENCRYPTION_KEY` (32-byte base64) from env. Both `apiKey` and `apiSecret` stored encrypted. Accept **read-only** keys only — reject if the key `canWithdraw` (and warn/flag if `canTrade`). Secrets never returned (masked `••••1234`).
- **Sync:** `POST /crypto/connections/:id/sync` on demand; optional incremental cron gated by `ENABLE_EXCHANGE_SYNC_CRON` (off by default). Idempotent upsert by `external_trade_id`.

## DB changes (migration `0001_exchange_sync`)

New enums:
- `exchange_provider` = `['binance','okx','bybit']` (only binance implemented now).
- `connection_status` = `['active','error','disabled']`.

New table `exchange_connections`:
`id uuid pk`, `user_id uuid fk users cascade`, `exchange exchange_provider`, `label varchar(80)`,
`api_key_enc text`, `api_secret_enc text`, `read_only boolean default true`, `status connection_status default 'active'`,
`last_sync_at timestamptz null`, `last_error text null`, `created_at timestamptz default now`.
Index `(user_id)`.

Alter `crypto_transactions`:
- add `source varchar(20) not null default 'manual'` (values `'manual'|'binance'|'okx'|'bybit'`).
- add `external_trade_id varchar(64) null`.
- partial unique index `crypto_tx_external_idx` on `(user_id, source, external_trade_id) WHERE external_trade_id IS NOT NULL` (idempotent imports).

Drizzle: update `crypto-transactions.ts` (+columns), add `exchange-connections.ts`, register in `schema/index.ts`, add enums in `enums.ts`. Hand-author `drizzle/0001_exchange_sync.sql` + journal entry (matches the scaffold's hand-authored-migration approach).

## Crypto / encryption util

`lib/crypto-secret.ts` (pure, testable):
- `encryptSecret(plaintext): string` → `base64(iv).base64(authTag).base64(ciphertext)` joined by `.`; AES-256-GCM, 12-byte IV, key = `Buffer.from(env.ENCRYPTION_KEY, 'base64')` (must be 32 bytes).
- `decryptSecret(payload): string`.
- `maskSecret(s): string` → `••••` + last 4.
- Throws if `ENCRYPTION_KEY` missing/wrong length (only when the feature is used).

## Exchange adapter

`modules/crypto/exchange/ExchangeAdapter.ts`:
```ts
interface ExchangeCreds { apiKey: string; apiSecret: string; }
interface KeyPermissions { canTrade: boolean; canWithdraw: boolean; canDeposit: boolean; }
interface NormalizedTrade {
  externalTradeId: string;
  coinSymbol: string;        // base asset, e.g. BTC
  side: 'buy' | 'sell';
  qty: string;               // base qty (8 dp)
  priceUsd: string;          // quote price (USDT≈USD)
  fee: string;
  feeCurrency: string;
  time: Date;
}
interface ExchangeAdapter {
  verifyKey(creds: ExchangeCreds): Promise<KeyPermissions>;
  fetchTrades(creds: ExchangeCreds, since?: Date): Promise<NormalizedTrade[]>;
}
```
- `BinanceAdapter`:
  - HMAC-SHA256 sign (`query + timestamp&recvWindow`, header `X-MBX-APIKEY`), base `https://api.binance.com`.
  - `verifyKey`: `GET /api/v3/account` → `{ canTrade, canWithdraw, canDeposit }`.
  - `fetchTrades`: for each non-zero balance asset, query `GET /api/v3/myTrades?symbol=<ASSET>USDT&startTime=` (paginate by `fromId`/time); map fills → `NormalizedTrade` (`isBuyer` → side; `qty`, `price`, `commission`/`commissionAsset`). Skip assets without a USDT pair.
  - Rate-limit aware (respect weight); wrap in try/catch.
- `MockExchangeAdapter`: returns canned permissions + trades for tests (no network).

## Service (`modules/crypto/exchange/connection.service.ts`)

- `create(userId, { exchange, label, apiKey, apiSecret })`:
  1. `adapter.verifyKey()`; **reject `CryptoError(400)` if `canWithdraw`** (not read-only). Flag `canTrade` (allow but mark).
  2. Encrypt key+secret; insert `exchange_connections` (`read_only`, `status='active'`).
  3. Return masked connection.
- `list(userId)` → connections with masked key, status, last_sync_at (never secrets).
- `remove(userId, id)` → delete (ownership-checked). (Imported txs stay.)
- `sync(userId, id)`:
  1. Load connection; decrypt creds.
  2. `adapter.fetchTrades(creds, since = last_sync_at ?? undefined)`.
  3. FX rate = `CryptoDataProvider.fetchFxRate()`; for each trade compute `priceVnd = priceUsd × rate`.
  4. Upsert into `crypto_transactions` (`source = exchange`, `external_trade_id`, `wallet = label||exchange`, `action = side`, `priceVnd/priceUsd/usdVndRate`, `fee/feeCurrency`) `onConflictDoNothing` on the partial unique index → idempotent.
  5. Update `last_sync_at = now`, `status`, `last_error`. Return `{ imported, skipped }`.
- All Binance failures → set `status='error'`, `last_error`, throw `CryptoError(502)`; never leak secrets to logs.

`exchange/factory.ts`: `adapterFor(exchange)` → `BinanceAdapter` (others throw `not implemented`).

## Routes (`crypto.routes.ts`, add) — JWT-guarded

- `POST /crypto/connections` — body `{ exchange, label?, apiKey, apiSecret }` → 201 masked connection.
- `GET /crypto/connections` → `{ connections: [...] }` (masked).
- `DELETE /crypto/connections/:id` → 204.
- `POST /crypto/connections/:id/sync` → `{ imported, skipped, lastSyncAt }`.

## Scheduler (optional cron)

`plugins/scheduler.ts`: when `ENABLE_EXCHANGE_SYNC_CRON`, a job (e.g. `*/30 * * * *`) iterates active connections and runs `sync` (incremental). Off by default; on-demand is primary.

## Env + deps

- `config/env.ts`: add `ENCRYPTION_KEY?` (base64 32 bytes), `ENABLE_EXCHANGE_SYNC_CRON` (bool, default false).
- No new npm deps (Node `crypto` for HMAC + AES; `fetch` for REST).
- `.env.example`/`.env.prod.example`: `ENCRYPTION_KEY=` (generate `openssl rand -base64 32`), `ENABLE_EXCHANGE_SYNC_CRON=false`.

## Web

- `apis/exchange.api.ts`: `listConnections`, `createConnection`, `deleteConnection`, `syncConnection(id)`.
- Settings → "Kết nối sàn" section: add-key form (exchange select, label, apiKey, apiSecret) with a **read-only warning + how-to link**; connection list (masked key, status, last sync, "Đồng bộ" + "Ngắt kết nối"). Surface `last_error`.

## Security (gate — do not ship without)

- Read-only keys only (reject withdraw-capable at connect).
- AES-256-GCM at rest; key from env; never log secrets; mask in all responses.
- Per-connection rate-limit + circuit breaker on Binance calls; signed-request `recvWindow`.
- IP-allowlist guidance documented (user-side on Binance).

## Testing

- **Pure unit (no network):**
  - `crypto-secret`: encrypt→decrypt round-trip; tamper → throws; wrong key length → throws; `maskSecret`.
  - `connection.service` verify-rejection: given `canWithdraw:true` → rejects (using `MockExchangeAdapter`).
  - trade normalization → `crypto_transactions` mapping (side, qty, priceVnd via rate) is correct.
- **Integration (DB-gated, MockExchangeAdapter):** create connection (read-only mock) → sync → `crypto_transactions` gains rows tagged `source='binance'`; re-sync → 0 new (idempotent); portfolio reflects imported holdings.
- **Manual/network:** real Binance read-only key — out of automated tests.

## Acceptance criteria

- [ ] Connect a read-only Binance key → stored encrypted; a withdraw-capable key is rejected at connect.
- [ ] `sync` imports trades into `crypto_transactions` (tagged `source`/`external_trade_id`); re-sync is idempotent (zero duplicates).
- [ ] Portfolio/DCA include imported trades; FX converts quote→VND.
- [ ] Secrets never appear in responses or logs; only via `ENCRYPTION_KEY` env.
- [ ] `pnpm --filter @finfolio/api test` green; crypto-secret + normalization + verify-rejection pass without network.

## Out of scope

OKX/Bybit adapters (interface ready), on-chain wallet sync (RPC/Etherscan), withdraw-capable keys, real-time websockets, automatic re-pricing of historical VND (uses current FX at import), git/CI.
