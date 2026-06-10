export interface GoldPriceRow {
  source: string;
  productName: string;
  priceBuy: string | null;
}

const DEFAULT_PRIORITY = ['sjc', 'doji', 'btmh', 'thanhlien', 'quanghanh'];

// lowercase, strip Vietnamese diacritics (NFD + drop combining marks), đ→d.
function clean(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

function norm(s: string): string {
  return clean(s).replace(/[^a-z0-9]/g, '');
}

function tokens(s: string): string[] {
  return clean(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Best-effort map a free-text gold type → a crawled buy-back price (VND/lượng).
 * Scores: exact=3, substring=2, shared-token=1; ties broken by source priority.
 * Returns the matched `priceBuy` or null (caller falls back to DCA).
 */
export function resolveCurrentPriceLuong(
  goldType: string,
  rows: GoldPriceRow[],
  priority: string[] = DEFAULT_PRIORITY,
): string | null {
  const nt = norm(goldType);
  const tt = tokens(goldType);
  let best: string | null = null;
  let bestScore = 0;
  let bestPri = Infinity;

  for (const row of rows) {
    if (!row.priceBuy) continue;
    const np = norm(row.productName);
    let score = 0;
    if (np === nt) score = 3;
    else if (np.includes(nt) || nt.includes(np)) score = 2;
    else if (tokens(row.productName).some((t) => tt.includes(t))) score = 1;
    if (score === 0) continue;

    const idx = priority.indexOf(row.source);
    const priRank = idx < 0 ? priority.length : idx;
    if (score > bestScore || (score === bestScore && priRank < bestPri)) {
      best = row.priceBuy;
      bestScore = score;
      bestPri = priRank;
    }
  }
  return best;
}
