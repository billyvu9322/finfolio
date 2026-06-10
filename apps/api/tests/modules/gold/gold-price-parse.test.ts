import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseGiavangOrg, parseVangThanhLien } from '../../../src/modules/gold/market/parse.js';

describe('parseGiavangOrg', () => {
  const html = `
    <table>
      <tr><td>Hồ Chí Minh</td><td>Vàng SJC 1L, 10L, 1KG</td><td class="text-right">133.800</td><td class="text-right">138.800</td></tr>
      <tr><td>Vàng nhẫn SJC 99,99% 1 chỉ</td><td class="text-right">133.600</td><td class="text-right">138.600</td></tr>
      <tr><td>Miền Bắc</td><td>Vàng SJC 1L, 10L, 1KG</td><td class="text-right">133.800</td><td class="text-right">138.800</td></tr>
    </table>`;

  it('parses products and converts ×1000 to VND/lượng, dedupes repeated rows', () => {
    const quotes = parseGiavangOrg(cheerio.load(html));
    expect(quotes).toHaveLength(2); // SJC 1L (deduped across regions) + nhẫn
    const sjc = quotes.find((q) => q.productName.startsWith('Vàng SJC 1L'))!;
    expect(sjc.priceBuy).toBe('133800000');
    expect(sjc.priceSell).toBe('138800000');
    const nhan = quotes.find((q) => q.productName.includes('nhẫn'))!;
    expect(nhan.priceBuy).toBe('133600000');
  });
});

describe('parseVangThanhLien', () => {
  const html = `
    <table>
      <thead><tr><th>Loại</th><th>Mua</th><th>Bán</th></tr></thead>
      <tbody>
        <tr><td data-label="Loại">Vàng Thành Liên 9999 24k</td><td data-label="Mua" class="tar">13.550.000</td><td data-label="Bán" class="tar">14.000.000</td></tr>
        <tr><td data-label="Loại">NT99</td><td data-label="Mua" class="tar">13.350.000</td><td data-label="Bán" class="tar">13.700.000</td></tr>
      </tbody>
    </table>`;

  it('parses data-label cells and converts ×10 (chỉ→lượng)', () => {
    const quotes = parseVangThanhLien(cheerio.load(html));
    expect(quotes).toHaveLength(2);
    const tl = quotes.find((q) => q.productName.includes('9999'))!;
    expect(tl.priceBuy).toBe('135500000'); // 13_550_000 × 10
    expect(tl.priceSell).toBe('140000000');
  });
});
