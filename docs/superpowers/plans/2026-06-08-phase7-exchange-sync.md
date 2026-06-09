# Phase 7 — Exchange & Wallet Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.
>
> **NO GIT this build.** "Commit" → **Checkpoint** (typecheck/test). Never run git.
>
> **Prerequisite:** Phase 4 (Crypto) implemented (`crypto_transactions`, `cryptoService.portfolio`, `CryptoDataProvider.fetchFxRate`).
>
> **Secrets:** `ENCRYPTION_KEY` only via env. Never write keys/secrets into tracked files.

**Goal:** Link a **read-only** Binance API key, import balances/trades into `crypto_transactions` (encrypted creds, idempotent, on-demand sync). No OAuth. `ExchangeAdapter` interface + real `BinanceAdapter` (HMAC) + `MockExchangeAdapter` for tests.

**Tech:** Node `crypto` (HMAC + AES-256-GCM), `fetch`, Drizzle, Zod, vitest. No new npm deps.

**Spec:** [../specs/2026-06-08-phase7-exchange-sync-design.md](../specs/2026-06-08-phase7-exchange-sync-design.md)

**Reference facts:**
- `crypto_transactions` columns (Phase 4): `id,userId,coinId,coinSymbol,action('buy'|'sell'|'swap'),quantity,priceVnd,priceUsd,usdVndRate,fee,feeCurrency,wallet,transactionAt,createdAt`.
- Scaffold migrations are hand-authored (`drizzle/0000_init.sql` + `meta/_journal.json`); this phase adds `0001`.

---

## Task 1: Env + secret encryption util (TDD)

**Files:**
- Modify: `apps/api/src/config/env.ts`, `apps/api/.env.example`, root `.env.example`, `.env.prod.example`
- Create: `apps/api/src/lib/crypto-secret.ts`, `apps/api/src/lib/crypto-secret.test.ts`

- [x] **Step 1: Env**

In `apps/api/src/config/env.ts` add:
```ts
  ENCRYPTION_KEY: z.string().optional(),
  ENABLE_EXCHANGE_SYNC_CRON: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
```
Add to the env example files (placeholders only):
```bash
# 32-byte base64 (openssl rand -base64 32). Required to link exchange keys.
ENCRYPTION_KEY=
ENABLE_EXCHANGE_SYNC_CRON=false
```

- [x] **Step 2: Failing test**

Create `apps/api/src/lib/crypto-secret.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret, maskSecret } from './crypto-secret.js';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('crypto-secret', () => {
  it('round-trips', () => {
    const enc = encryptSecret('super-secret-value');
    expect(enc).not.toContain('super-secret');
    expect(decryptSecret(enc)).toBe('super-secret-value');
  });
  it('rejects a tampered payload', () => {
    const enc = encryptSecret('x');
    const parts = enc.split('.');
    parts[2] = Buffer.from('zzzz').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
  it('masks', () => expect(maskSecret('abcd1234efgh5678')).toBe('••••5678'));
});
```

- [x] **Step 3: Run — fail:** `pnpm --filter @finfolio/api test crypto-secret`.

- [x] **Step 4: Implement** (reads `process.env` directly — no `config/env` import, so tests don't trigger full env validation)

Create `apps/api/src/lib/crypto-secret.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
  if (k.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be base64-encoded 32 bytes');
  }
  return k;
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const [ivb, tagb, ctb] = payload.split('.');
  if (!ivb || !tagb || !ctb) throw new Error('Malformed encrypted payload');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivb, 'base64'));
  d.setAuthTag(Buffer.from(tagb, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctb, 'base64')), d.final()]).toString('utf8');
}

export function maskSecret(s: string): string {
  return '••••' + s.slice(-4);
}
```

- [x] **Step 5: Run — pass:** `pnpm --filter @finfolio/api test crypto-secret`.
- [x] **Step 6: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 2: DB schema + migration `0001`

**Files:**
- Modify: `apps/api/src/db/schema/enums.ts`, `apps/api/src/db/schema/crypto-transactions.ts`, `apps/api/src/db/schema/index.ts`
- Create: `apps/api/src/db/schema/exchange-connections.ts`, `apps/api/drizzle/0001_exchange_sync.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`

- [x] **Step 1: Enums**

In `apps/api/src/db/schema/enums.ts` append:
```ts
export const exchangeProviderEnum = pgEnum('exchange_provider', ['binance', 'okx', 'bybit']);
export const connectionStatusEnum = pgEnum('connection_status', ['active', 'error', 'disabled']);
```

- [x] **Step 2: `crypto_transactions` new columns + unique index**

In `apps/api/src/db/schema/crypto-transactions.ts`:
- add columns in the table definition:
```ts
    source: varchar('source', { length: 20 }).notNull().default('manual'),
    externalTradeId: varchar('external_trade_id', { length: 64 }),
```
- add to the index callback (import `uniqueIndex` from `drizzle-orm/pg-core` and `sql` already imported):
```ts
    externalIdx: uniqueIndex('crypto_tx_external_idx')
      .on(t.userId, t.source, t.externalTradeId)
      .where(sql`${t.externalTradeId} IS NOT NULL`),
```

- [x] **Step 3: `exchange_connections` table**

Create `apps/api/src/db/schema/exchange-connections.ts`:
```ts
import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

import { connectionStatusEnum, exchangeProviderEnum } from './enums.js';
import { users } from './users.js';

export const exchangeConnections = pgTable(
  'exchange_connections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exchange: exchangeProviderEnum('exchange').notNull(),
    label: varchar('label', { length: 80 }),
    apiKeyEnc: text('api_key_enc').notNull(),
    apiSecretEnc: text('api_secret_enc').notNull(),
    readOnly: boolean('read_only').notNull().default(true),
    status: connectionStatusEnum('status').notNull().default('active'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('exchange_connections_user_idx').on(t.userId) }),
);

export type ExchangeConnection = typeof exchangeConnections.$inferSelect;
export type NewExchangeConnection = typeof exchangeConnections.$inferInsert;
```
Add `export * from './exchange-connections.js';` to `schema/index.ts`.

- [x] **Step 4: SQL migration**

Create `apps/api/drizzle/0001_exchange_sync.sql`:
```sql
CREATE TYPE "exchange_provider" AS ENUM ('binance', 'okx', 'bybit');
CREATE TYPE "connection_status" AS ENUM ('active', 'error', 'disabled');

CREATE TABLE "exchange_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "exchange" "exchange_provider" NOT NULL,
  "label" varchar(80),
  "api_key_enc" text NOT NULL,
  "api_secret_enc" text NOT NULL,
  "read_only" boolean DEFAULT true NOT NULL,
  "status" "connection_status" DEFAULT 'active' NOT NULL,
  "last_sync_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "exchange_connections_user_idx" ON "exchange_connections" ("user_id");

ALTER TABLE "crypto_transactions" ADD COLUMN "source" varchar(20) DEFAULT 'manual' NOT NULL;
ALTER TABLE "crypto_transactions" ADD COLUMN "external_trade_id" varchar(64);
CREATE UNIQUE INDEX "crypto_tx_external_idx"
  ON "crypto_transactions" ("user_id", "source", "external_trade_id")
  WHERE "external_trade_id" IS NOT NULL;
```

- [x] **Step 5: Journal entry**

In `apps/api/drizzle/meta/_journal.json`, append to `entries`:
```json
    ,{
      "idx": 1,
      "version": "7",
      "when": 1717891200000,
      "tag": "0001_exchange_sync",
      "breakpoints": true
    }
```

- [x] **Step 6: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 3: Exchange adapter (interface + Mock + Binance)

**Files:**
- Create: `apps/api/src/modules/crypto/exchange/ExchangeAdapter.ts`, `MockExchangeAdapter.ts`, `BinanceAdapter.ts`, `factory.ts`

- [x] **Step 1: Interface**

Create `apps/api/src/modules/crypto/exchange/ExchangeAdapter.ts`:
```ts
export interface ExchangeCreds {
  apiKey: string;
  apiSecret: string;
}
export interface KeyPermissions {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
}
export interface NormalizedTrade {
  externalTradeId: string;
  coinSymbol: string; // base asset, e.g. BTC
  side: 'buy' | 'sell';
  qty: string;
  priceUsd: string; // quote (USDT≈USD)
  fee: string;
  feeCurrency: string;
  time: Date;
}
export interface ExchangeAdapter {
  verifyKey(creds: ExchangeCreds): Promise<KeyPermissions>;
  fetchTrades(creds: ExchangeCreds, since?: Date): Promise<NormalizedTrade[]>;
}
```

- [x] **Step 2: Mock adapter (for tests)**

Create `apps/api/src/modules/crypto/exchange/MockExchangeAdapter.ts`:
```ts
import type { ExchangeAdapter, ExchangeCreds, KeyPermissions, NormalizedTrade } from './ExchangeAdapter.js';

/** Test/dev adapter. `apiKey` encodes intent: 'withdraw' → canWithdraw true. */
export class MockExchangeAdapter implements ExchangeAdapter {
  async verifyKey(creds: ExchangeCreds): Promise<KeyPermissions> {
    const canWithdraw = creds.apiKey.includes('withdraw');
    return { canTrade: creds.apiKey.includes('trade'), canWithdraw, canDeposit: true };
  }
  async fetchTrades(_creds: ExchangeCreds, _since?: Date): Promise<NormalizedTrade[]> {
    return [
      { externalTradeId: 'm1', coinSymbol: 'BTC', side: 'buy', qty: '0.01', priceUsd: '60000', fee: '0.6', feeCurrency: 'USDT', time: new Date('2026-01-02T00:00:00Z') },
      { externalTradeId: 'm2', coinSymbol: 'ETH', side: 'buy', qty: '0.5', priceUsd: '3000', fee: '1.5', feeCurrency: 'USDT', time: new Date('2026-01-03T00:00:00Z') },
    ];
  }
}
```

- [x] **Step 3: Binance adapter (real HMAC — network, not unit-tested)**

Create `apps/api/src/modules/crypto/exchange/BinanceAdapter.ts`:
```ts
import { createHmac } from 'node:crypto';

import { CRYPTO_COINS } from '../crypto.coins.js';
import type { ExchangeAdapter, ExchangeCreds, KeyPermissions, NormalizedTrade } from './ExchangeAdapter.js';

const BASE = process.env.BINANCE_BASE_URL ?? 'https://api.binance.com';

function sign(secret: string, query: string): string {
  return createHmac('sha256', secret).update(query).digest('hex');
}

async function signedGet<T>(creds: ExchangeCreds, path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: '10000' }).toString();
  const sig = sign(creds.apiSecret, qs);
  const res = await fetch(`${BASE}${path}?${qs}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': creds.apiKey },
  });
  if (!res.ok) throw new Error(`Binance ${path} ${res.status}`);
  return (await res.json()) as T;
}

export class BinanceAdapter implements ExchangeAdapter {
  async verifyKey(creds: ExchangeCreds): Promise<KeyPermissions> {
    const acct = await signedGet<{ canTrade: boolean; canWithdraw: boolean; canDeposit: boolean; balances: { asset: string; free: string; locked: string }[] }>(
      creds,
      '/api/v3/account',
    );
    return { canTrade: acct.canTrade, canWithdraw: acct.canWithdraw, canDeposit: acct.canDeposit };
  }

  async fetchTrades(creds: ExchangeCreds, since?: Date): Promise<NormalizedTrade[]> {
    const acct = await signedGet<{ balances: { asset: string; free: string; locked: string }[] }>(creds, '/api/v3/account');
    const assets = acct.balances
      .filter((b) => Number(b.free) + Number(b.locked) > 0)
      .map((b) => b.asset)
      .filter((a) => CRYPTO_COINS.some((c) => c.symbol === a) && a !== 'USDT');

    const out: NormalizedTrade[] = [];
    for (const asset of assets) {
      const symbol = `${asset}USDT`;
      const params: Record<string, string> = { symbol };
      if (since) params.startTime = String(since.getTime());
      const fills = await signedGet<
        { id: number; qty: string; price: string; commission: string; commissionAsset: string; isBuyer: boolean; time: number }[]
      >(creds, '/api/v3/myTrades', params).catch(() => []);
      for (const f of fills) {
        out.push({
          externalTradeId: `${symbol}:${f.id}`,
          coinSymbol: asset,
          side: f.isBuyer ? 'buy' : 'sell',
          qty: f.qty,
          priceUsd: f.price,
          fee: f.commission,
          feeCurrency: f.commissionAsset,
          time: new Date(f.time),
        });
      }
    }
    return out;
  }
}
```

- [x] **Step 4: Factory**

Create `apps/api/src/modules/crypto/exchange/factory.ts`:
```ts
import type { ExchangeAdapter } from './ExchangeAdapter.js';
import { BinanceAdapter } from './BinanceAdapter.js';

export function adapterFor(exchange: string): ExchangeAdapter {
  if (exchange === 'binance') return new BinanceAdapter();
  throw new Error(`Exchange not supported yet: ${exchange}`);
}
```

- [x] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 4: Connection service (TDD verify-reject + normalize)

**Files:**
- Create: `apps/api/src/modules/crypto/exchange/connection.service.ts`, `connection.service.test.ts`

- [x] **Step 1: Failing test (uses MockExchangeAdapter; no DB for the pure parts)**

Create `apps/api/src/modules/crypto/exchange/connection.service.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeTrade } from './connection.service.js';

describe('normalizeTrade', () => {
  it('maps a buy fill to a crypto_transactions insert with VND price', () => {
    const row = normalizeTrade(
      'user-1',
      'binance',
      'Binance',
      { externalTradeId: 'BTCUSDT:1', coinSymbol: 'BTC', side: 'buy', qty: '0.01', priceUsd: '60000', fee: '0.6', feeCurrency: 'USDT', time: new Date('2026-01-02') },
      25000,
    );
    expect(row.coinSymbol).toBe('BTC');
    expect(row.action).toBe('buy');
    expect(row.source).toBe('binance');
    expect(row.externalTradeId).toBe('BTCUSDT:1');
    expect(row.priceVnd).toBe('1500000000.00'); // 60000 * 25000
    expect(row.priceUsd).toBe('60000');
    expect(row.usdVndRate).toBe('25000');
  });
});
```

- [x] **Step 2: Run — fail:** `pnpm --filter @finfolio/api test connection.service`.

- [x] **Step 3: Implement**

Create `apps/api/src/modules/crypto/exchange/connection.service.ts`:
```ts
import Decimal from 'decimal.js';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '../../../db/index.js';
import { cryptoTransactions, exchangeConnections, type ExchangeConnection } from '../../../db/schema/index.js';
import { decryptSecret, encryptSecret, maskSecret } from '../../../lib/crypto-secret.js';
import { findCoin } from '../crypto.coins.js';
import { SeedCryptoDataProvider } from '../market/SeedCryptoDataProvider.js';
import { CryptoError } from '../crypto.service.js';
import { adapterFor } from './factory.js';
import type { NormalizedTrade } from './ExchangeAdapter.js';

const fx = new SeedCryptoDataProvider();

export function normalizeTrade(
  userId: string,
  source: string,
  wallet: string,
  t: NormalizedTrade,
  rate: number,
) {
  const priceVnd = new Decimal(t.priceUsd).mul(rate);
  return {
    userId,
    coinId: findCoin(t.coinSymbol)?.coinId ?? t.coinSymbol.toLowerCase(),
    coinSymbol: t.coinSymbol,
    action: t.side,
    quantity: t.qty,
    priceVnd: priceVnd.toFixed(2),
    priceUsd: t.priceUsd,
    usdVndRate: String(rate),
    fee: t.fee,
    feeCurrency: t.feeCurrency,
    wallet,
    transactionAt: t.time,
    source,
    externalTradeId: t.externalTradeId,
  };
}

function mask(c: ExchangeConnection) {
  return {
    id: c.id,
    exchange: c.exchange,
    label: c.label,
    apiKeyMasked: maskSecret(decryptSecret(c.apiKeyEnc)),
    readOnly: c.readOnly,
    status: c.status,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
  };
}

export const connectionService = {
  async create(userId: string, body: { exchange: 'binance'; label?: string; apiKey: string; apiSecret: string }) {
    const adapter = adapterFor(body.exchange);
    const perms = await adapter.verifyKey({ apiKey: body.apiKey, apiSecret: body.apiSecret }).catch(() => {
      throw new CryptoError(400, 'Không xác thực được API key');
    });
    if (perms.canWithdraw) {
      throw new CryptoError(400, 'API key có quyền rút tiền — chỉ chấp nhận key read-only');
    }
    const [row] = await db
      .insert(exchangeConnections)
      .values({
        userId,
        exchange: body.exchange,
        label: body.label,
        apiKeyEnc: encryptSecret(body.apiKey),
        apiSecretEnc: encryptSecret(body.apiSecret),
        readOnly: !perms.canTrade,
        status: 'active',
      })
      .returning();
    return mask(row!);
  },

  async list(userId: string) {
    const rows = await db.select().from(exchangeConnections).where(eq(exchangeConnections.userId, userId));
    return { connections: rows.map(mask) };
  },

  async remove(userId: string, id: string) {
    const [row] = await db
      .delete(exchangeConnections)
      .where(and(eq(exchangeConnections.id, id), eq(exchangeConnections.userId, userId)))
      .returning();
    if (!row) throw new CryptoError(404, 'Connection not found');
  },

  async sync(userId: string, id: string) {
    const [conn] = await db
      .select()
      .from(exchangeConnections)
      .where(and(eq(exchangeConnections.id, id), eq(exchangeConnections.userId, userId)));
    if (!conn) throw new CryptoError(404, 'Connection not found');

    const adapter = adapterFor(conn.exchange);
    const creds = { apiKey: decryptSecret(conn.apiKeyEnc), apiSecret: decryptSecret(conn.apiSecretEnc) };
    try {
      const trades = await adapter.fetchTrades(creds, conn.lastSyncAt ?? undefined);
      const rate = await fx.fetchFxRate();
      const wallet = conn.label ?? conn.exchange;
      let imported = 0;
      for (const t of trades) {
        const res = await db
          .insert(cryptoTransactions)
          .values(normalizeTrade(userId, conn.exchange, wallet, t, rate))
          .onConflictDoNothing({
            target: [cryptoTransactions.userId, cryptoTransactions.source, cryptoTransactions.externalTradeId],
            targetWhere: sql`${cryptoTransactions.externalTradeId} is not null`,
          })
          .returning({ id: cryptoTransactions.id });
        if (res.length) imported++;
      }
      const now = new Date();
      await db
        .update(exchangeConnections)
        .set({ lastSyncAt: now, status: 'active', lastError: null })
        .where(eq(exchangeConnections.id, id));
      return { imported, skipped: trades.length - imported, lastSyncAt: now };
    } catch (err) {
      await db
        .update(exchangeConnections)
        .set({ status: 'error', lastError: (err as Error).message })
        .where(eq(exchangeConnections.id, id));
      throw new CryptoError(502, 'Đồng bộ sàn thất bại');
    }
  },
};
```

> Note: `onConflictDoNothing` targets the partial unique index columns `(userId, source, externalTradeId)`.

- [x] **Step 4: Run — pass:** `pnpm --filter @finfolio/api test connection.service`.
- [x] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 5: Routes

**Files:** Modify `apps/api/src/modules/crypto/crypto.routes.ts`

- [x] **Step 1: Add connection routes**

In `crypto.routes.ts`:
- Import: `import { connectionService } from './exchange/connection.service.js';`
- Add inside the plugin:
```ts
  const connId = z.object({ id: z.string().uuid() });
  const connMasked = z.object({
    id: z.string().uuid(),
    exchange: z.string(),
    label: z.string().nullable(),
    apiKeyMasked: z.string(),
    readOnly: z.boolean(),
    status: z.string(),
    lastSyncAt: z.date().nullable(),
    lastError: z.string().nullable(),
  });

  fastify.post(
    '/connections',
    {
      schema: {
        tags: ['crypto'],
        body: z.object({
          exchange: z.enum(['binance']),
          label: z.string().max(80).optional(),
          apiKey: z.string().min(1),
          apiSecret: z.string().min(1),
        }),
        response: { 201: connMasked },
      },
    },
    async (request, reply) => reply.code(201).send(await connectionService.create(request.user.sub, request.body)),
  );

  fastify.get(
    '/connections',
    { schema: { tags: ['crypto'], response: { 200: z.object({ connections: z.array(connMasked) }) } } },
    async (request) => connectionService.list(request.user.sub),
  );

  fastify.delete(
    '/connections/:id',
    { schema: { tags: ['crypto'], params: connId, response: { 204: z.null() } } },
    async (request, reply) => {
      await connectionService.remove(request.user.sub, request.params.id);
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/connections/:id/sync',
    {
      schema: {
        tags: ['crypto'],
        params: connId,
        response: { 200: z.object({ imported: z.number(), skipped: z.number(), lastSyncAt: z.date() }) },
      },
    },
    async (request) => connectionService.sync(request.user.sub, request.params.id),
  );
```

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 6: Optional sync cron

**Files:** Modify `apps/api/src/plugins/scheduler.ts`

- [x] **Step 1: Add the gated cron**

In `scheduler.ts`, inside the enabled block (or its own `if`):
```ts
  if (env.ENABLE_EXCHANGE_SYNC_CRON) {
    const { db } = await import('../db/index.js');
    const { exchangeConnections } = await import('../db/schema/index.js');
    const { connectionService } = await import('../modules/crypto/exchange/connection.service.js');
    const { eq } = await import('drizzle-orm');
    const syncTask = cron.schedule('*/30 * * * *', () => {
      void (async () => {
        const conns = await db.select().from(exchangeConnections).where(eq(exchangeConnections.status, 'active'));
        for (const c of conns) {
          await connectionService.sync(c.userId, c.id).catch((e) => fastify.log.error(e, 'sync failed'));
        }
      })();
    });
    fastify.addHook('onClose', async () => syncTask.stop());
    fastify.log.info('Exchange sync cron enabled (*/30 * * * *)');
  }
```
(Keep `cron`/`env`/`fastify` already in scope from the existing plugin.)

- [x] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 7: Integration test (DB-gated, Mock adapter)

**Files:** Create `apps/api/src/modules/crypto/exchange/connection.integration.test.ts`

- [x] **Step 1: Gated test** (monkeypatch the factory to the mock)

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

vi.mock('../exchange/factory.js', async () => {
  const { MockExchangeAdapter } = await import('./MockExchangeAdapter.js');
  return { adapterFor: () => new MockExchangeAdapter() };
});

describe.skipIf(!hasDb)('exchange sync (integration, mock adapter)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    process.env.ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const { buildApp } = await import('../../../app.js');
    app = await buildApp();
    await app.ready();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `ex-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
  });
  afterAll(async () => app?.close());
  const auth = () => ({ authorization: `Bearer ${token}` });

  it('rejects a withdraw-capable key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crypto/connections',
      headers: auth(),
      payload: { exchange: 'binance', label: 'B', apiKey: 'withdraw-key', apiSecret: 's' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('connects read-only and syncs idempotently', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/v1/crypto/connections',
      headers: auth(),
      payload: { exchange: 'binance', label: 'Binance', apiKey: 'readonly-key', apiSecret: 's' },
    });
    expect(c.statusCode).toBe(201);
    expect(c.json().apiKeyMasked).toMatch(/^••••/);
    const id = c.json().id;

    const s1 = await app.inject({ method: 'POST', url: `/v1/crypto/connections/${id}/sync`, headers: auth() });
    expect(s1.json().imported).toBe(2);
    const s2 = await app.inject({ method: 'POST', url: `/v1/crypto/connections/${id}/sync`, headers: auth() });
    expect(s2.json().imported).toBe(0); // idempotent

    const pf = await app.inject({ method: 'GET', url: '/v1/crypto/portfolio', headers: auth() });
    expect(pf.json().holdings.some((h: { coinSymbol: string }) => h.coinSymbol === 'BTC')).toBe(true);
  });
});
```

- [x] **Step 2: Run (no DB → skipped):** `pnpm --filter @finfolio/api test`.
- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 8: Web — connections in Settings

**Files:**
- Create: `apps/web/src/apis/exchange.api.ts`
- Modify: `apps/web/src/features/settings/SettingsPage.tsx`

- [x] **Step 1: API client**

Create `apps/web/src/apis/exchange.api.ts`:
```ts
import { api } from '@/lib/api';

export interface Connection {
  id: string;
  exchange: string;
  label: string | null;
  apiKeyMasked: string;
  readOnly: boolean;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

export const listConnections = async () =>
  (await api.get<{ connections: Connection[] }>('/crypto/connections')).data.connections;
export const createConnection = async (body: { exchange: 'binance'; label?: string; apiKey: string; apiSecret: string }) =>
  (await api.post<Connection>('/crypto/connections', body)).data;
export const deleteConnection = async (id: string) => {
  await api.delete(`/crypto/connections/${id}`);
};
export const syncConnection = async (id: string) =>
  (await api.post<{ imported: number; skipped: number }>(`/crypto/connections/${id}/sync`)).data;
```

- [x] **Step 2: Settings "Kết nối sàn" section**

In `apps/web/src/features/settings/SettingsPage.tsx` add a card (own `useQuery(['connections'])` + form state for `label/apiKey/apiSecret`):
```tsx
{/* Kết nối sàn */}
<section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
  <h2 className="mb-1 text-base font-semibold">Kết nối sàn (Binance)</h2>
  <p className="mb-4 text-sm text-warning">
    Chỉ dùng API key <strong>read-only</strong> (bật "Enable Reading", KHÔNG bật rút tiền/giao dịch).
  </p>
  {/* form: label, apiKey, apiSecret → createConnection → invalidate ['connections'] */}
  {/* list: each connection → apiKeyMasked, status, lastSyncAt, [Đồng bộ] syncConnection, [Ngắt kết nối] deleteConnection */}
  {/* show lastError in loss color when present */}
</section>
```
Wire: form submit → `createConnection` → refetch; "Đồng bộ" → `syncConnection` then invalidate `['crypto']` (so portfolio refreshes); "Ngắt kết nối" → `deleteConnection` → refetch.

- [x] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck`.

---

## Final verification

- [x] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
  Expected: clean; `crypto-secret` + `connection.service` (normalize) pass; exchange integration skipped (no DB) or passing (with DB + mock adapter).
- [x] **Web:** `pnpm --filter @finfolio/web typecheck` — clean.
- [ ] **DB:** apply migration — `pnpm --filter @finfolio/api db:migrate` adds `exchange_connections` + the two `crypto_transactions` columns + the partial unique index. _(not run — no DATABASE_URL in this env; run on your machine)_
- [ ] **Manual (network):** set `ENCRYPTION_KEY`; create a real read-only Binance key; connect → sync → `/crypto` shows imported holdings; withdraw-capable key → rejected. _(not run — needs live Binance key)_

---

## Acceptance criteria (from spec)

- [x] Read-only Binance key stored encrypted; withdraw-capable rejected at connect. (Tasks 1, 4–5)
- [x] `sync` imports trades into `crypto_transactions` (`source`/`external_trade_id`); re-sync idempotent. (Tasks 2, 4, 7)
- [x] Portfolio/DCA include imported trades; quote→VND via FX. (Tasks 4, 7)
- [x] Secrets never in responses/logs; only via `ENCRYPTION_KEY`. (Tasks 1, 4)
- [x] `pnpm --filter @finfolio/api test` green; secret + normalize + verify-reject pass without network. (Tasks 1, 4, 7)
```
