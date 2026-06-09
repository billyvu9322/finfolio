import { createHmac } from 'node:crypto';

import { CRYPTO_COINS } from '../crypto.coins.js';
import type { ExchangeAdapter, ExchangeCreds, KeyPermissions, NormalizedTrade } from './ExchangeAdapter.js';

const BASE = process.env.BINANCE_BASE_URL ?? 'https://api.binance.com';

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}
interface BinanceAccount {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  balances: BinanceBalance[];
}
interface BinanceFill {
  id: number;
  qty: string;
  price: string;
  commission: string;
  commissionAsset: string;
  isBuyer: boolean;
  time: number;
}

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
    const acct = await signedGet<BinanceAccount>(creds, '/api/v3/account');
    return { canTrade: acct.canTrade, canWithdraw: acct.canWithdraw, canDeposit: acct.canDeposit };
  }

  async fetchTrades(creds: ExchangeCreds, since?: Date): Promise<NormalizedTrade[]> {
    const acct = await signedGet<BinanceAccount>(creds, '/api/v3/account');
    const assets = acct.balances
      .filter((b) => Number(b.free) + Number(b.locked) > 0)
      .map((b) => b.asset)
      .filter((a) => a !== 'USDT' && CRYPTO_COINS.some((c) => c.symbol === a));

    const out: NormalizedTrade[] = [];
    for (const asset of assets) {
      const symbol = `${asset}USDT`;
      const params: Record<string, string> = { symbol };
      if (since) params.startTime = String(since.getTime());
      const fills = await signedGet<BinanceFill[]>(creds, '/api/v3/myTrades', params).catch(() => [] as BinanceFill[]);
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
