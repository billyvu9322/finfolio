import { GiavangOrgSource } from './GiavangOrgSource.js';
import type { GoldPriceSource } from './GoldPriceSource.js';
import { QuangHanhSource } from './QuangHanhSource.js';
import { VangThanhLienSource } from './VangThanhLienSource.js';
import { XauUsdSource } from './XauUsdSource.js';

/** All gold price sources, in display priority order (XAU/USD first = priority 1). */
export function goldPriceSources(): GoldPriceSource[] {
  return [
    new XauUsdSource(),
    new GiavangOrgSource('sjc', 'Vàng SJC', '/trong-nuoc/sjc/'),
    new GiavangOrgSource('doji', 'Vàng Doji', '/trong-nuoc/doji/'),
    new GiavangOrgSource('btmh', 'Bảo Tín Mạnh Hải', '/trong-nuoc/bao-tin-manh-hai/'),
    new VangThanhLienSource(),
    new QuangHanhSource(),
  ];
}

/** Display order for sources (lower = first). XAU/USD = priority 1. */
export const GOLD_SOURCE_ORDER = ['xau', 'sjc', 'doji', 'btmh', 'thanhlien', 'quanghanh'];

/** key → display label (for rendering stored rows). */
export const GOLD_SOURCE_LABELS: Record<string, string> = {
  xau: 'XAU/USD (Thế giới)',
  sjc: 'Vàng SJC',
  doji: 'Vàng Doji',
  btmh: 'Bảo Tín Mạnh Hải',
  thanhlien: 'Vàng Thành Liên',
  quanghanh: 'Vàng Quang Hạnh',
};
