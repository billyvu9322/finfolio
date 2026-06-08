export type Exchange = 'HOSE' | 'HNX' | 'UPCOM';

export interface SymbolEntry {
  symbol: string;
  exchange: Exchange;
  name: string;
}

export const STOCK_SYMBOLS: SymbolEntry[] = [
  { symbol: 'FPT', exchange: 'HOSE', name: 'FPT Corporation' },
  { symbol: 'MWG', exchange: 'HOSE', name: 'The Gioi Di Dong' },
  { symbol: 'VNM', exchange: 'HOSE', name: 'Vinamilk' },
  { symbol: 'HPG', exchange: 'HOSE', name: 'Hoa Phat' },
  { symbol: 'VCB', exchange: 'HOSE', name: 'Vietcombank' },
  { symbol: 'VIC', exchange: 'HOSE', name: 'Vingroup' },
  { symbol: 'VHM', exchange: 'HOSE', name: 'Vinhomes' },
  { symbol: 'MSN', exchange: 'HOSE', name: 'Masan Group' },
  { symbol: 'TCB', exchange: 'HOSE', name: 'Techcombank' },
  { symbol: 'ACB', exchange: 'HOSE', name: 'Asia Commercial Bank' },
  { symbol: 'SSI', exchange: 'HOSE', name: 'SSI Securities' },
  { symbol: 'VND', exchange: 'HOSE', name: 'VNDirect' },
  { symbol: 'GAS', exchange: 'HOSE', name: 'PV Gas' },
  { symbol: 'SHS', exchange: 'HNX', name: 'Saigon Hanoi Securities' },
  { symbol: 'PVS', exchange: 'HNX', name: 'PTSC' },
  { symbol: 'CEO', exchange: 'HNX', name: 'CEO Group' },
  { symbol: 'IDC', exchange: 'HNX', name: 'IDICO' },
  { symbol: 'BSR', exchange: 'UPCOM', name: 'Binh Son Refining' },
  { symbol: 'OIL', exchange: 'UPCOM', name: 'PV Oil' },
  { symbol: 'VGT', exchange: 'UPCOM', name: 'Vinatex' },
];

export function findSymbol(code: string): SymbolEntry | undefined {
  const normalized = code.toUpperCase();
  return STOCK_SYMBOLS.find((entry) => entry.symbol === normalized);
}

export function searchSymbols(query: string, limit = 10): SymbolEntry[] {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return STOCK_SYMBOLS.slice(0, limit);
  return STOCK_SYMBOLS.filter(
    (entry) => entry.symbol.startsWith(normalized) || entry.name.toUpperCase().includes(normalized),
  ).slice(0, limit);
}
