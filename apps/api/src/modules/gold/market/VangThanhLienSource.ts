import { fetchHtml } from '../../../lib/http-html.js';
import type { GoldPriceSource, GoldQuote } from './GoldPriceSource.js';
import { parseVangThanhLien } from './parse.js';

export class VangThanhLienSource implements GoldPriceSource {
  readonly key = 'thanhlien';
  readonly label = 'Vàng Thành Liên';

  async fetch(): Promise<GoldQuote[]> {
    return parseVangThanhLien(await fetchHtml('https://vangthanhlien.com/'));
  }
}
