import { createHmac } from 'node:crypto';

import Decimal from 'decimal.js';

import { CRYPTO_COINS } from '../crypto.coins.js';
import type { ExchangeAdapter, ExchangeCreds, KeyPermissions, NormalizedHolding, NormalizedTrade } from './ExchangeAdapter.js';

const BASE = process.env.BINANCE_BASE_URL ?? 'https://api.binance.com';

const STABLE = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD']);

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
interface MarginAsset {
  asset: string;
  netAsset: string;
}
interface CrossMarginAccount {
  userAssets: MarginAsset[];
}
interface IsolatedMarginAccount {
  assets: Array<{ baseAsset: MarginAsset; quoteAsset: MarginAsset }>;
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
    const held = acct.balances.filter((b) => Number(b.free) + Number(b.locked) > 0).map((b) => b.asset);
    const assets = held.filter((a) => a !== 'USDT' && CRYPTO_COINS.some((c) => c.symbol === a));
    const skipped = held.filter((a) => a !== 'USDT' && !CRYPTO_COINS.some((c) => c.symbol === a));
    if (skipped.length) {
      console.warn(`[binance] held assets not in CRYPTO_COINS whitelist, skipped: ${skipped.join(', ')}`);
    }
    if (assets.length === 0) {
      throw new Error(
        `No syncable spot balances. Held: [${held.join(', ') || 'none'}]. ` +
          `Only coins with a balance>0 and in the whitelist [${CRYPTO_COINS.map((c) => c.symbol).join(', ')}] are synced.`,
      );
    }

    const out: NormalizedTrade[] = [];
    const errors: string[] = [];
    for (const asset of assets) {
      const symbol = `${asset}USDT`;
      const params: Record<string, string> = { symbol };
      if (since) params.startTime = String(since.getTime());
      let fills: BinanceFill[];
      try {
        fills = await signedGet<BinanceFill[]>(creds, '/api/v3/myTrades', params);
      } catch (err) {
        // Don't swallow silently — record so the caller can surface the real reason.
        const msg = `${symbol}: ${(err as Error).message}`;
        errors.push(msg);
        console.error(`[binance] myTrades failed ${msg}`);
        continue;
      }
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
    // All per-symbol calls failed and nothing came back → surface the real reason
    // instead of silently reporting "0 imported".
    if (out.length === 0 && errors.length > 0) {
      throw new Error(`Binance myTrades failed for all symbols — ${errors.join('; ')}`);
    }
    return out;
  }

  /**
   * Snapshot current holdings across the spot account (incl. Simple Earn
   * `LD<COIN>` synthetic assets, e.g. LDXRP = XRP in Earn) and the cross +
   * isolated margin accounts (net asset). Each coin is resolved to its base
   * symbol, quantities summed, and valued at the live `<COIN>USDT` price.
   * Coins with no USDT spot pair (can't be priced) and stablecoins are skipped.
   * Margin reads are best-effort: a key without margin permission (403) is
   * skipped rather than failing the whole sync.
   */
  async fetchHoldings(creds: ExchangeCreds): Promise<NormalizedHolding[]> {
    const [acct, priceRes] = await Promise.all([
      signedGet<BinanceAccount>(creds, '/api/v3/account'),
      fetch(`${BASE}/api/v3/ticker/price`, { headers: { Accept: 'application/json' } }),
    ]);
    if (!priceRes.ok) throw new Error(`Binance ticker/price ${priceRes.status}`);
    const tickers = (await priceRes.json()) as Array<{ symbol: string; price: string }>;
    // base asset → current USDT price
    const usdtPrice = new Map<string, string>();
    for (const t of tickers) {
      if (t.symbol.endsWith('USDT')) usdtPrice.set(t.symbol.slice(0, -4), t.price);
    }

    const qtyByCoin = new Map<string, Decimal>();
    const add = (rawAsset: string, amount: Decimal, earn = false) => {
      if (amount.lte(0)) return;
      let sym = rawAsset.toUpperCase();
      // Resolve Simple Earn (LD-prefixed) only when the stripped symbol is a real
      // priced coin — avoids mangling genuine tickers like LDO (Lido).
      if (earn && !usdtPrice.has(sym) && sym.startsWith('LD') && usdtPrice.has(sym.slice(2))) {
        sym = sym.slice(2);
      }
      if (STABLE.has(sym) || !usdtPrice.has(sym)) return;
      qtyByCoin.set(sym, (qtyByCoin.get(sym) ?? new Decimal(0)).plus(amount));
    };

    // Spot + Simple Earn
    for (const b of acct.balances) add(b.asset, new Decimal(b.free).plus(b.locked), true);

    // Cross margin (best-effort — needs margin read permission).
    const cross = await signedGet<CrossMarginAccount>(creds, '/sapi/v1/margin/account').catch(() => null);
    for (const a of cross?.userAssets ?? []) add(a.asset, new Decimal(a.netAsset));

    // Isolated margin (best-effort).
    const iso = await signedGet<IsolatedMarginAccount>(creds, '/sapi/v1/margin/isolated/account').catch(() => null);
    for (const pair of iso?.assets ?? []) {
      add(pair.baseAsset.asset, new Decimal(pair.baseAsset.netAsset));
      add(pair.quoteAsset.asset, new Decimal(pair.quoteAsset.netAsset));
    }

    return [...qtyByCoin.entries()].map(([coinSymbol, qty]) => ({
      coinSymbol,
      qty: qty.toString(),
      priceUsd: usdtPrice.get(coinSymbol)!,
    }));
  }
}
