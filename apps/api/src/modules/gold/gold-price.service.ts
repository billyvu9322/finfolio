import { eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { goldPrices } from '../../db/schema/index.js';
import type { GoldPriceSource } from './market/GoldPriceSource.js';
import { GOLD_SOURCE_LABELS, GOLD_SOURCE_ORDER, goldPriceSources } from './market/sources.js';

const GOLD_PRICE_STALE_MS = 26 * 60 * 60 * 1000; // daily crawl → stale after ~26h

export interface RefreshSourceResult {
  key: string;
  label: string;
  count?: number;
  error?: string;
}

export const goldPriceService = {
  /** Crawl each source and upsert its quotes. One source failing never aborts the others. */
  async refreshGoldPrices(sources: GoldPriceSource[] = goldPriceSources()) {
    const results: RefreshSourceResult[] = [];
    let total = 0;
    for (const source of sources) {
      try {
        const quotes = await source.fetch();
        for (const q of quotes) {
          await db
            .insert(goldPrices)
            .values({
              source: source.key,
              productName: q.productName,
              priceBuy: q.priceBuy,
              priceSell: q.priceSell,
              currency: q.currency ?? 'VND',
              unit: q.unit ?? 'luong',
            })
            .onConflictDoUpdate({
              target: [goldPrices.source, goldPrices.productName],
              set: {
                priceBuy: q.priceBuy,
                priceSell: q.priceSell,
                currency: q.currency ?? 'VND',
                unit: q.unit ?? 'luong',
                fetchedAt: new Date(),
              },
            });
        }
        total += quotes.length;
        results.push({ key: source.key, label: source.label, count: quotes.length });
      } catch (err) {
        results.push({ key: source.key, label: source.label, error: (err as Error).message });
      }
    }
    return { total, sources: results };
  },

  /** Card read: stored rows mapped to the existing goldPriceSchema shape. */
  async getPrices() {
    const rows = await db.select().from(goldPrices);
    const now = Date.now();
    const rank = (src: string) => {
      const i = GOLD_SOURCE_ORDER.indexOf(src);
      return i < 0 ? GOLD_SOURCE_ORDER.length : i;
    };
    rows.sort((a, b) => rank(a.source) - rank(b.source) || a.productName.localeCompare(b.productName));
    return {
      prices: rows.map((row) => ({
        symbol: row.productName,
        priceBuy: row.priceBuy,
        priceSell: row.priceSell,
        currency: row.currency,
        unit: row.unit,
        source: GOLD_SOURCE_LABELS[row.source] ?? row.source,
        fetchedAt: row.fetchedAt,
        stale: now - row.fetchedAt.getTime() > GOLD_PRICE_STALE_MS,
      })),
      updatedAt: rows.reduce<Date | null>(
        (latest, row) => (!latest || row.fetchedAt > latest ? row.fetchedAt : latest),
        null,
      ),
    };
  },

  /** Raw rows for valuation (source, productName, priceBuy). */
  async listForValuation() {
    return db
      .select({ source: goldPrices.source, productName: goldPrices.productName, priceBuy: goldPrices.priceBuy })
      .from(goldPrices)
      .where(eq(goldPrices.currency, 'VND'));
  },
};
