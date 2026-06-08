import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('dashboard + reports (integration)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    const { buildApp } = await import('../../../src/app.js');
    app = await buildApp();
    await app.ready();
    const reg = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: `dash-${Date.now()}@finfolio.test`, password: 'Abcd1234' } });
    token = reg.json().accessToken;
    await app.inject({ method: 'POST', url: '/v1/gold/transactions', headers: auth(), payload: { goldType: 'SJC_1C', action: 'buy', quantity: 10, unit: 'chi', pricePerUnit: 1000000, storage: 'Nhà' } });
    await app.inject({ method: 'POST', url: '/v1/stocks/transactions', headers: auth(), payload: { symbol: 'FPT', action: 'buy', quantity: 100, price: 90000 } });
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('summary aggregates gold + stock', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/dashboard/summary', headers: auth() });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.breakdown.map((item: { assetClass: string }) => item.assetClass).sort()).toContain('gold');
    expect(json.breakdown.map((item: { assetClass: string }) => item.assetClass).sort()).toContain('stock');
  });

  it('snapshot then growth + reports snapshot', async () => {
    const snap = await app.inject({ method: 'POST', url: '/v1/dashboard/snapshot', headers: auth() });
    const date = snap.json().snapshotDate;
    const growth = await app.inject({ method: 'GET', url: '/v1/dashboard/growth?period=all', headers: auth() });
    expect(growth.json().data.length).toBeGreaterThanOrEqual(1);
    const report = await app.inject({ method: 'GET', url: `/v1/reports/snapshot?date=${date}`, headers: auth() });
    expect(report.statusCode).toBe(200);
  });

  it('csv export returns text/csv with a header line', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/reports/export/csv?module=gold', headers: auth() });
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('Loại vàng');
  });
});
