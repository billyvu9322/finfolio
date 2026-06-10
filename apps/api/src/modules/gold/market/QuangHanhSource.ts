import { fetchHtml } from '../../../lib/http-html.js';
import type { GoldPriceSource, GoldQuote } from './GoldPriceSource.js';
import { parseGenericTable } from './parse.js';

/**
 * giavangmaothiet.com (Quang Hạnh). Bot-blocks (403) — fetchHtml sends a browser
 * User-Agent; if still blocked it throws and the refresh job skips this source.
 * Best-effort generic table parse (unit assumed VND/lượng) when reachable.
 */
export class QuangHanhSource implements GoldPriceSource {
  readonly key = 'quanghanh';
  readonly label = 'Vàng Quang Hạnh';

  async fetch(): Promise<GoldQuote[]> {
    // Page shows "x1000đ/chỉ" (e.g. "12.950") → ×1000 (nghìn) ×10 (chỉ→lượng) = ×10000.
    return parseGenericTable(await fetchHtml('https://giavangmaothiet.com/gia-vang-quang-hanh-hom-nay/'), 10000);
  }
}
