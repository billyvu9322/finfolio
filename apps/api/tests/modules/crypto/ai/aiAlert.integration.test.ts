import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('crypto AI alerts (integration)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    // No LLM_API_KEY in tests → rule-based fallback path.
    const { buildApp } = await import('../../../../src/app.js');
    app = await buildApp();
    await app.ready();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `alert-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
    await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'buy', quantity: 0.5, price: 1000000000, wallet: 'Binance' },
    });
  });

  afterAll(async () => app?.close());

  it('returns alerts with a valid severity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crypto/alerts',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const a = res.json().alerts;
    expect(Array.isArray(a)).toBe(true);
    if (a.length) expect(['info', 'warning', 'critical']).toContain(a[0].severity);
  });
});
