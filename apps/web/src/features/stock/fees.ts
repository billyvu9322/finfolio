export type StockAction = 'buy' | 'sell' | 'cash_dividend' | 'stock_dividend';

const RATES = { buyBrokerage: 0.0015, sellBrokerage: 0.0015, sellTax: 0.001 };

export function computeStockFees(action: StockAction, quantity: number, price: number) {
  const value = quantity * price;
  if (action === 'buy') return { brokerageFee: value * RATES.buyBrokerage, tax: 0 };
  if (action === 'sell') return { brokerageFee: value * RATES.sellBrokerage, tax: value * RATES.sellTax };
  return { brokerageFee: 0, tax: 0 };
}
