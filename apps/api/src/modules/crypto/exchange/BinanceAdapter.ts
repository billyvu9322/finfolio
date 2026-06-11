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
interface EarnFlexiblePosition {
  rows: Array<{ asset: string; totalAmount: string }>;
  total: number;
}
interface EarnLockedPosition {
  rows: Array<{ asset: string; amount: string }>;
  total: number;
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
   * Snapshot current holdings across spot, Simple Earn (Flexible + Locked), and
   * cross + isolated margin (net asset). Quantities are summed per base symbol
   * and valued at the live `<COIN>USDT` price; coins with no USDT pair and
   * stablecoins are skipped. Earn/margin reads are best-effort — a key without
   * the relevant permission (403) is skipped, never fails the whole sync.
   *
   * NOTE: Simple Earn balances come from the dedicated `/sapi/v1/simple-earn/*`
   * endpoints, NOT the `LD<COIN>` shadow assets in `/api/v3/account` (legacy
   * Lending; unreliable/dust — they gave wrong quantities). LD-prefixed spot
   * balances are therefore ignored to avoid wrong qty and double-counting.
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
    const add = (rawAsset: string, amount: Decimal) => {
      if (amount.lte(0)) return;
      const sym = rawAsset.toUpperCase();
      if (STABLE.has(sym) || !usdtPrice.has(sym)) return;
      qtyByCoin.set(sym, (qtyByCoin.get(sym) ?? new Decimal(0)).plus(amount));
    };

    // Best-effort signed GET that logs (instead of hiding) why a source was skipped.
    const tryGet = async <T>(path: string, params: Record<string, string> = {}): Promise<T | null> => {
      try {
        return await signedGet<T>(creds, path, params);
      } catch (err) {
        console.warn(`[binance] ${path} skipped: ${(err as Error).message}`);
        return null;
      }
    };

    // Spot — skip LD<COIN> (legacy Lending shadow; real Earn comes from the
    // Simple Earn endpoints below).
    const spotAssets = acct.balances.filter((b) => new Decimal(b.free).plus(b.locked).gt(0));
    for (const b of spotAssets) {
      if (b.asset.toUpperCase().startsWith('LD')) continue;
      add(b.asset, new Decimal(b.free).plus(b.locked));
    }

    // Simple Earn — Flexible (best-effort). totalAmount = real principal.
    const flex = await tryGet<EarnFlexiblePosition>('/sapi/v1/simple-earn/flexible/position', { size: '100' });
    for (const r of flex?.rows ?? []) add(r.asset, new Decimal(r.totalAmount));

    // Simple Earn — Locked (best-effort).
    const locked = await tryGet<EarnLockedPosition>('/sapi/v1/simple-earn/locked/position', { size: '100' });
    for (const r of locked?.rows ?? []) add(r.asset, new Decimal(r.amount));

    // Cross margin (best-effort — needs margin read permission).
    const cross = await tryGet<CrossMarginAccount>('/sapi/v1/margin/account');
    for (const a of cross?.userAssets ?? []) add(a.asset, new Decimal(a.netAsset));

    // Isolated margin (best-effort).
    const iso = await tryGet<IsolatedMarginAccount>('/sapi/v1/margin/isolated/account');
    for (const pair of iso?.assets ?? []) {
      add(pair.baseAsset.asset, new Decimal(pair.baseAsset.netAsset));
      add(pair.quoteAsset.asset, new Decimal(pair.quoteAsset.netAsset));
    }

    const result = [...qtyByCoin.entries()].map(([coinSymbol, qty]) => ({
      coinSymbol,
      qty: qty.toString(),
      priceUsd: usdtPrice.get(coinSymbol)!,
    }));
    // Verbose source attribution — pinpoints where each quantity originates.
    console.info('[binance] flex rows: ' + JSON.stringify(flex?.rows ?? []));
    console.info('[binance] locked rows: ' + JSON.stringify(locked?.rows ?? []));
    console.info(
      '[binance] spot>0: ' +
        spotAssets.map((b) => `${b.asset}:${new Decimal(b.free).plus(b.locked).toString()}`).join(', '),
    );
    console.info(
      '[binance] cross>0: ' +
        (cross?.userAssets ?? [])
          .filter((a) => new Decimal(a.netAsset).gt(0))
          .map((a) => `${a.asset}:${a.netAsset}`)
          .join(', '),
    );
    console.info(
      `[binance] holdings — spot:${spotAssets.length} flexEarn:${flex?.rows?.length ?? 'skip'} ` +
        `lockedEarn:${locked?.rows?.length ?? 'skip'} cross:${cross?.userAssets?.length ?? 'skip'} ` +
        `iso:${iso?.assets?.length ?? 'skip'} → ${result.map((r) => `${r.coinSymbol}:${r.qty}`).join(', ')}`,
    );
    return result;
  }
}
