export interface CoinEntry {
  coinId: string;
  symbol: string;
  name: string;
}

export const CRYPTO_COINS: CoinEntry[] = [
  { coinId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { coinId: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { coinId: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { coinId: 'solana', symbol: 'SOL', name: 'Solana' },
  { coinId: 'ripple', symbol: 'XRP', name: 'XRP' },
  { coinId: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { coinId: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { coinId: 'tron', symbol: 'TRX', name: 'TRON' },
  { coinId: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { coinId: 'polygon', symbol: 'MATIC', name: 'Polygon' },
  { coinId: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  { coinId: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { coinId: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { coinId: 'tether', symbol: 'USDT', name: 'Tether' },
  { coinId: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
  { coinId: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu' },
  { coinId: 'near', symbol: 'NEAR', name: 'NEAR Protocol' },
  { coinId: 'aptos', symbol: 'APT', name: 'Aptos' },
  { coinId: 'arbitrum', symbol: 'ARB', name: 'Arbitrum' },
  { coinId: 'the-open-network', symbol: 'TON', name: 'Toncoin' },
];

export function findCoin(symbolOrId: string): CoinEntry | undefined {
  const value = symbolOrId.trim().toLowerCase();
  return CRYPTO_COINS.find((coin) => coin.symbol.toLowerCase() === value || coin.coinId.toLowerCase() === value);
}

export function searchCoins(query: string, limit = 10): CoinEntry[] {
  const value = query.trim().toUpperCase();
  if (!value) return CRYPTO_COINS.slice(0, limit);
  return CRYPTO_COINS.filter((coin) => coin.symbol.startsWith(value) || coin.name.toUpperCase().includes(value)).slice(0, limit);
}
