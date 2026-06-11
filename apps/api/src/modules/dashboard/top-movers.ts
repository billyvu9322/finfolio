import Decimal from 'decimal.js';

import type { HoldingLite } from './aggregator.js';

const TOP_MOVERS_LIMIT = 3;

export function computeTopMovers(holdings: HoldingLite[]) {
  const map = (holding: HoldingLite) => ({ assetClass: holding.assetClass, label: holding.label, pnlPct: holding.pnlPct!.toFixed(2) });

  return {
    gainers: holdings
      .filter((holding) => holding.pnlPct !== null && holding.pnlPct.gt(new Decimal(0)))
      .sort((a, b) => b.pnlPct!.minus(a.pnlPct!).toNumber())
      .slice(0, TOP_MOVERS_LIMIT)
      .map(map),
    losers: holdings
      .filter((holding) => holding.pnlPct !== null && holding.pnlPct.lt(new Decimal(0)))
      .sort((a, b) => a.pnlPct!.minus(b.pnlPct!).toNumber())
      .slice(0, TOP_MOVERS_LIMIT)
      .map(map),
  };
}
