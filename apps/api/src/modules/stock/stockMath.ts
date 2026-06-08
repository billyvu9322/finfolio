import Decimal from 'decimal.js';

export type StockAction = 'buy' | 'sell' | 'cash_dividend' | 'stock_dividend';

export interface StockTx {
  action: StockAction;
  quantity: number;
  price: string | number;
  brokerageFee: string | number;
  tax: string | number;
  transactionAt: Date;
}

export interface StockHolding {
  qty: Decimal;
  avgCost: Decimal;
  investedRemaining: Decimal;
  dividendIncome: Decimal;
}

export const FEE_RATES = { buyBrokerage: 0.0015, sellBrokerage: 0.0015, sellTax: 0.001 };

export function computeStockFees(
  action: StockAction,
  quantity: number,
  price: string | number,
  rates = FEE_RATES,
): { brokerageFee: Decimal; tax: Decimal } {
  const value = new Decimal(price).mul(quantity);
  if (action === 'buy') return { brokerageFee: value.mul(rates.buyBrokerage), tax: new Decimal(0) };
  if (action === 'sell') return { brokerageFee: value.mul(rates.sellBrokerage), tax: value.mul(rates.sellTax) };
  return { brokerageFee: new Decimal(0), tax: new Decimal(0) };
}

export function computeHolding(transactions: StockTx[]): StockHolding {
  const ordered = [...transactions].sort((a, b) => a.transactionAt.getTime() - b.transactionAt.getTime());
  let qty = new Decimal(0);
  let cost = new Decimal(0);
  let dividendIncome = new Decimal(0);

  for (const tx of ordered) {
    const txQty = new Decimal(tx.quantity);
    if (tx.action === 'buy') {
      qty = qty.plus(txQty);
      cost = cost.plus(new Decimal(tx.price).mul(txQty)).plus(tx.brokerageFee).plus(tx.tax);
    } else if (tx.action === 'stock_dividend') {
      qty = qty.plus(txQty);
    } else if (tx.action === 'sell') {
      const avg = qty.isZero() ? new Decimal(0) : cost.div(qty);
      cost = Decimal.max(0, cost.minus(avg.mul(txQty)));
      qty = Decimal.max(0, qty.minus(txQty));
    } else {
      dividendIncome = dividendIncome.plus(new Decimal(tx.price).mul(txQty));
    }
  }

  return {
    qty,
    avgCost: qty.isZero() ? new Decimal(0) : cost.div(qty),
    investedRemaining: cost,
    dividendIncome,
  };
}

export function heldQty(transactions: StockTx[]): Decimal {
  return computeHolding(transactions).qty;
}

export function unrealizedPnl(
  qty: number | Decimal,
  avgCost: string | number | Decimal,
  currentPrice: string | number | Decimal,
): { pnl: Decimal; pnlPct: Decimal } {
  const quantity = new Decimal(qty);
  const avg = new Decimal(avgCost);
  const current = new Decimal(currentPrice);
  const pnl = current.minus(avg).mul(quantity);
  const basis = avg.mul(quantity);
  return { pnl, pnlPct: basis.isZero() ? new Decimal(0) : pnl.div(basis).mul(100) };
}
