export interface GoldQuote {
  productName: string;
  priceBuy: string | null; // canonical VND/lượng (unless currency/unit overridden)
  priceSell: string | null;
  currency?: string; // default 'VND'
  unit?: string; // default 'luong'
}

export interface GoldPriceSource {
  key: string; // 'sjc' | 'doji' | 'btmh' | 'thanhlien' | 'quanghanh'
  label: string; // display name
  fetch(): Promise<GoldQuote[]>;
}
