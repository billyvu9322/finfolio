import Decimal from 'decimal.js';

export type FeeCurrency = 'VND' | 'USDT' | 'COIN';

export interface CryptoTx {
  action: 'buy' | 'sell';
  quantity: string | number;
  priceVnd: string | number;
  feeVnd: string | number;
  transactionAt: Date;
}

export interface CryptoHolding {
  qty: Decimal;
  avgCostVnd: Decimal;
  investedVnd: Decimal;
}

export function computeFeeVnd(fee: string | number, feeCurrency: FeeCurrency, priceVnd: string | number, rate: number): Decimal {
  const amount = new Decimal(fee);
  if (feeCurrency === 'VND') return amount;
  if (feeCurrency === 'USDT') return amount.mul(rate);
  return amount.mul(priceVnd);
}

export function computeHolding(transactions: CryptoTx[]): CryptoHolding {
  const ordered = [...transactions].sort((a, b) => a.transactionAt.getTime() - b.transactionAt.getTime());
  let qty = new Decimal(0);
  let cost = new Decimal(0);

  for (const transaction of ordered) {
    const tradeQty = new Decimal(transaction.quantity);
    if (transaction.action === 'buy') {
      qty = qty.plus(tradeQty);
      cost = cost.plus(new Decimal(transaction.priceVnd).mul(tradeQty)).plus(transaction.feeVnd);
    } else {
      const avgCost = qty.isZero() ? new Decimal(0) : cost.div(qty);
      cost = cost.minus(avgCost.mul(tradeQty));
      qty = qty.minus(tradeQty);
      if (qty.lt(0)) qty = new Decimal(0);
      if (cost.lt(0)) cost = new Decimal(0);
    }
  }

  return {
    qty,
    avgCostVnd: qty.isZero() ? new Decimal(0) : cost.div(qty),
    investedVnd: cost,
  };
}

export function heldQty(transactions: CryptoTx[]): Decimal {
  return computeHolding(transactions).qty;
}

export function unrealizedPnl(
  qty: string | number | Decimal,
  avgCostVnd: string | number | Decimal,
  currentPriceVnd: string | number | Decimal,
): { pnl: Decimal; pnlPct: Decimal } {
  const quantity = new Decimal(qty);
  const avgCost = new Decimal(avgCostVnd);
  const currentPrice = new Decimal(currentPriceVnd);
  const pnl = currentPrice.minus(avgCost).mul(quantity);
  const basis = avgCost.mul(quantity);
  return { pnl, pnlPct: basis.isZero() ? new Decimal(0) : pnl.div(basis).mul(100) };
}
