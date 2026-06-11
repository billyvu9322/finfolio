const BASE = process.env.VCI_BASE_URL ?? 'https://trading.vietcap.com.vn/api';

// VCI rejects bot-less requests — send browser-like headers.
const HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Referer: 'https://trading.vietcap.com.vn/',
  Origin: 'https://trading.vietcap.com.vn',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

export interface StockTicker {
  symbol: string;
  price: string; // latest close, in VND (integer string)
}

interface GapChartRow {
  symbol: string;
  o: number[];
  h: number[];
  l: number[];
  c: number[]; // close series, oldest → newest
  t: string[]; // unix seconds (strings)
}

const RANGE_DAYS = { '1m': 30, '3m': 90, '6m': 180 } as const;

/**
 * Latest close per symbol from VCI/Vietcap's public OHLC endpoint.
 *
 * `POST /chart/OHLCChart/gap-chart` with `{ timeFrame, symbols, to, countBack }`.
 * Verified 2026-06-11: values are already in **VND** (e.g. FPT ≈ 73600), so NO
 * ×1000 scaling. The multi-symbol `symbols` array returns `[]`, so we request
 * one symbol per call and take the last `c` (most recent session close = the
 * "current price"; outside trading hours this is the last close, which is correct).
 * Per-symbol errors are skipped (logged); a symbol with no data is omitted and the
 * caller falls back to the previous cached price.
 */
export async function fetchVciQuotes(symbols: string[]): Promise<StockTicker[]> {
  if (!symbols.length) return [];
  const to = Math.floor(Date.now() / 1000);
  const out: StockTicker[] = [];

  for (const raw of symbols) {
    const symbol = raw.toUpperCase();
    try {
      const res = await fetch(`${BASE}/chart/OHLCChart/gap-chart`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ timeFrame: 'ONE_DAY', symbols: [symbol], to, countBack: 2 }),
      });
      if (!res.ok) throw new Error(`VCI gap-chart ${symbol} -> ${res.status}`);
      const rows = (await res.json()) as GapChartRow[];
      const closes = rows.find((r) => r.symbol === symbol)?.c ?? rows[0]?.c;
      const last = closes?.[closes.length - 1];
      if (last == null || !Number.isFinite(last) || last <= 0) continue;
      out.push({ symbol, price: String(Math.round(last)) });
    } catch (err) {
      console.warn(`[vci] price fetch failed ${symbol}: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Daily OHLC candles for one symbol over a range (prices already in VND). */
export async function fetchVciOhlc(
  symbol: string,
  range: '1m' | '3m' | '6m',
): Promise<{ time: string; open: number; high: number; low: number; close: number }[]> {
  const sym = symbol.toUpperCase();
  const to = Math.floor(Date.now() / 1000);
  const res = await fetch(`${BASE}/chart/OHLCChart/gap-chart`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ timeFrame: 'ONE_DAY', symbols: [sym], to, countBack: RANGE_DAYS[range] }),
  });
  if (!res.ok) throw new Error(`VCI gap-chart ${sym} -> ${res.status}`);
  const rows = (await res.json()) as GapChartRow[];
  const row = rows.find((r) => r.symbol === sym) ?? rows[0];
  if (!row?.c?.length) throw new Error(`VCI gap-chart ${sym}: empty`);
  return row.t.map((t, i) => ({
    time: new Date(Number(t) * 1000).toISOString().slice(0, 10),
    open: row.o[i]!,
    high: row.h[i]!,
    low: row.l[i]!,
    close: row.c[i]!,
  }));
}
