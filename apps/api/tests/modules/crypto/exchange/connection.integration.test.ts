import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

// Swap the real BinanceAdapter for the network-free mock (path matches the
// specifier connection.service.ts imports → vitest dedupes by resolved id).
vi.mock('../../../../src/modules/crypto/exchange/factory.js', async () => {
  const { MockExchangeAdapter } = await import('../../../../src/modules/crypto/exchange/MockExchangeAdapter.js');
  return { adapterFor: () => new MockExchangeAdapter() };
});

describe.skipIf(!hasDb)('exchange sync (integration, mock adapter)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    process.env.ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const { buildApp } = await import('../../../../src/app.js');
    app = await buildApp();
    await app.ready();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `ex-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

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
