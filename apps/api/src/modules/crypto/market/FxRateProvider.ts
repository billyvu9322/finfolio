/**
 * Real-time USD→VND exchange rate, replacing the seed constant (25,000).
 *
 * Source: exchangerate-api.com v6 when EXCHANGERATE_API_KEY is set, otherwise
 * the free open.er-api.com endpoint (no key). Result is cached in-memory for
 * ~15 min so the portfolio endpoint doesn't hit the network on every request.
 * On any failure (network, bad payload, missing rate) we fall back to
 * FALLBACK_USD_VND so valuation never breaks — same behaviour as the old seed.
 */
const FALLBACK_USD_VND = 25000;
const CACHE_MS = 15 * 60 * 1000;

let cache: { rate: number; at: number } | null = null;

function endpoint(): string {
  const key = process.env.EXCHANGERATE_API_KEY;
  return key
    ? `https://v6.exchangerate-api.com/v6/${key}/pair/USD/VND`
    : 'https://open.er-api.com/v6/latest/USD';
}

/** Pull the VND rate out of whichever provider's JSON shape we got. */
function parseRate(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  // exchangerate-api /pair shape
  if (typeof b.conversion_rate === 'number') return b.conversion_rate;
  // open.er-api /latest shape
  const rates = b.rates as Record<string, unknown> | undefined;
  if (rates && typeof rates.VND === 'number') return rates.VND;
  return null;
}

/** USD→VND rate, cached ~15 min, falling back to 25,000 on error. */
export async function fetchUsdVndRate(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.rate;

  try {
    const res = await fetch(endpoint(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`FX rate -> ${res.status}`);
    const rate = parseRate(await res.json());
    if (!rate || rate <= 0) throw new Error('FX rate: VND missing in payload');
    cache = { rate, at: now };
    return rate;
  } catch {
    // Keep a stale cached value if we have one; else the seed fallback.
    return cache?.rate ?? FALLBACK_USD_VND;
  }
}
