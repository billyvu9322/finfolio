import Decimal from 'decimal.js';

export function computeBreakdown(items: { key: string; value: Decimal }[]): { key: string; value: string; pct: string }[] {
  const total = items.reduce((sum, item) => sum.plus(item.value), new Decimal(0));
  return items.map((item) => ({
    key: item.key,
    value: item.value.toFixed(2),
    pct: total.isZero() ? '0.00' : item.value.div(total).mul(100).toFixed(2),
  }));
}
