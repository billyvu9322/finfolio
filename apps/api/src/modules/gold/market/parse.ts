import type { CheerioAPI } from 'cheerio';

import type { GoldQuote } from './GoldPriceSource.js';

// A price cell like "133.800" or "13.550.000" (dot/comma thousands) or plain digits.
const NUM_RE = /^\d{1,3}(?:[.,]\d{3})+$|^\d{4,}$/;

/** Keep digits only (drops thousands separators + suffixes like "đ") × multiplier → VND/lượng. */
function toVnd(raw: string, multiplier: number): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  return String(Number(digits) * multiplier);
}

/**
 * giavang.org layout (SJC/Doji/BTMH): rows of `name | buy | sell` in `x1000đ/lượng`
 * → ×1000. Product name is sometimes a `<th>` (BTMH) and sometimes a `<td>` (SJC/Doji),
 * so scan `th,td` cells in order. Region blocks repeat names → dedupe (keep first).
 */
export function parseGiavangOrg($: CheerioAPI): GoldQuote[] {
  const out: GoldQuote[] = [];
  const seen = new Set<string>();
  $('tr').each((_, tr) => {
    const cells = $(tr)
      .find('th,td')
      .toArray()
      .map((c) => $(c).text().trim());
    const numIdx = cells.findIndex((t) => NUM_RE.test(t));
    if (numIdx < 1 || numIdx + 1 >= cells.length) return;
    const productName = cells[numIdx - 1]!;
    const priceBuy = toVnd(cells[numIdx]!, 1000);
    const priceSell = toVnd(cells[numIdx + 1]!, 1000);
    if (!productName || NUM_RE.test(productName) || !priceBuy || !priceSell || seen.has(productName)) return;
    seen.add(productName);
    out.push({ productName, priceBuy, priceSell });
  });
  return out;
}

/**
 * vangthanhlien.com: positional `name | buy | sell` cells; prices in đồng/chỉ (e.g.
 * "12.950.000đ") → ×10 (chỉ→lượng).
 */
export function parseVangThanhLien($: CheerioAPI): GoldQuote[] {
  const out: GoldQuote[] = [];
  $('tr').each((_, tr) => {
    const tds = $(tr)
      .find('td')
      .toArray()
      .map((td) => $(td).text().trim());
    if (tds.length < 3) return;
    const productName = tds[0]!;
    const priceBuy = toVnd(tds[1]!, 10);
    const priceSell = toVnd(tds[2]!, 10);
    if (!productName || NUM_RE.test(productName) || !priceBuy || !priceSell) return;
    out.push({ productName, priceBuy, priceSell });
  });
  return out;
}

/**
 * Generic `name | buy | sell` table parser (used for Quang Hạnh when reachable).
 * Unit unknown/assumed VND/lượng (multiplier=1); best-effort, source skipped on fetch error.
 */
export function parseGenericTable($: CheerioAPI, multiplier = 1): GoldQuote[] {
  const out: GoldQuote[] = [];
  const seen = new Set<string>();
  $('tr').each((_, tr) => {
    const tds = $(tr)
      .find('td')
      .toArray()
      .map((td) => $(td).text().trim());
    const numIdx = tds.findIndex((t) => NUM_RE.test(t));
    if (numIdx < 1 || numIdx + 1 >= tds.length) return;
    const productName = tds[numIdx - 1]!;
    const priceBuy = toVnd(tds[numIdx]!, multiplier);
    const priceSell = toVnd(tds[numIdx + 1]!, multiplier);
    if (!productName || !priceBuy || !priceSell || seen.has(productName)) return;
    seen.add(productName);
    out.push({ productName, priceBuy, priceSell });
  });
  return out;
}
