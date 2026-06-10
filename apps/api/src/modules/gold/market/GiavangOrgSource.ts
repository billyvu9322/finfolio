import { fetchHtml } from '../../../lib/http-html.js';
import type { GoldPriceSource, GoldQuote } from './GoldPriceSource.js';
import { parseGiavangOrg } from './parse.js';

const BASE = 'https://giavang.org';

/** giavang.org trong-nuoc pages (SJC / Doji / Bảo Tín Mạnh Hải) — same table layout. */
export class GiavangOrgSource implements GoldPriceSource {
  constructor(
    readonly key: string,
    readonly label: string,
    private readonly path: string,
  ) {}

  async fetch(): Promise<GoldQuote[]> {
    return parseGiavangOrg(await fetchHtml(`${BASE}${this.path}`));
  }
}
