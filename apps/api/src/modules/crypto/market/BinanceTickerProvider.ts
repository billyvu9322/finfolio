const BASE = process.env.BINANCE_BASE_URL ?? 'https://api.binance.com';

const STABLE = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD']);

export interface CoinTicker {
  coinSymbol: string;
  priceUsdt: string;
  change24hPct: string;
}

interface Binance24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
}

/**
 * Public Binance 24h ticker (no auth/key needed — works whether or not the user
 * linked an API key). Fetches the full ticker list once and maps the requested
 * base assets via their `<SYMBOL>USDT` pair. Stablecoins → price 1. Symbols
 * without a USDT pair are omitted (caller falls back to the seed price).
 */
export async function fetchBinanceTickers(symbols: string[]): Promise<CoinTicker[]> {
  if (!symbols.length) return [];
  const res = await fetch(`${BASE}/api/v3/ticker/24hr`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Binance ticker -> ${res.status}`);
  const all = (await res.json()) as Binance24h[];
  const byPair = new Map(all.map((t) => [t.symbol, t]));

  const out: CoinTicker[] = [];
  for (const raw of symbols) {
    const sym = raw.toUpperCase();
    if (STABLE.has(sym)) {
      out.push({ coinSymbol: sym, priceUsdt: '1', change24hPct: '0' });
      continue;
    }
    const t = byPair.get(`${sym}USDT`);
    if (t) out.push({ coinSymbol: sym, priceUsdt: t.lastPrice, change24hPct: t.priceChangePercent });
  }
  return out;
}
