import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('crypto routes (integration)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    const { buildApp } = await import('../../../src/app.js');
    app = await buildApp();
    await app.ready();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `crypto-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('buy 0.5 BTC on Binance -> portfolio holding', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: auth(),
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'buy', quantity: 0.5, price: 1000000000, wallet: 'Binance' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/crypto/portfolio', headers: auth() });
    const holding = res.json().holdings.find((row: { coinSymbol: string; wallet: string }) => row.coinSymbol === 'BTC' && row.wallet === 'Binance');
    expect(holding.qty).toBe('0.5');
  });

  it('sell exceeding wallet holdings -> 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: auth(),
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'sell', quantity: 5, price: 1000000000, wallet: 'Binance' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('same coin on a second wallet is a separate position', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: auth(),
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'buy', quantity: 0.2, price: 1000000000, wallet: 'Ledger' },
    });
    const res = await app.inject({ method: 'GET', url: '/v1/crypto/portfolio', headers: auth() });
    const wallets = res.json().holdings.filter((row: { coinSymbol: string }) => row.coinSymbol === 'BTC').map((row: { wallet: string }) => row.wallet).sort();
    expect(wallets).toEqual(['Binance', 'Ledger']);
  });

  it('swap BTC->ETH creates sell + buy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crypto/swap',
      headers: auth(),
      payload: {
        sourceCoinId: 'bitcoin',
        sourceSymbol: 'BTC',
        sourceQty: 0.1,
        destCoinId: 'ethereum',
        destSymbol: 'ETH',
        destQty: 1.5,
        valueVnd: 100000000,
        wallet: 'Binance',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().source.action).toBe('sell');
    expect(res.json().dest.action).toBe('buy');
  });

  it('prices returns quotes + fxRate', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/crypto/prices', headers: auth() });
    expect(res.json().fxRate).toBeGreaterThan(0);
    expect(res.json().quotes.length).toBeGreaterThan(0);
  });
});
