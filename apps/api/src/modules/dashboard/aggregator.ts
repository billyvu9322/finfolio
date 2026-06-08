import Decimal from 'decimal.js';

import { cryptoService } from '../crypto/crypto.service.js';
import { goldService } from '../gold/gold.service.js';
import { stockService } from '../stock/stock.service.js';

export type AssetClass = 'gold' | 'stock' | 'crypto';

export interface HoldingLite {
  assetClass: AssetClass;
  label: string;
  value: Decimal | null;
  pnl: Decimal | null;
  pnlPct: Decimal | null;
}

export interface AssetSummary {
  assetClass: AssetClass;
  value: Decimal;
  invested: Decimal;
  pnl: Decimal;
  holdings: HoldingLite[];
}

interface AssetModule {
  assetClass: AssetClass;
  getSummary(userId: string): Promise<AssetSummary>;
}

const dec = (value: string | null | undefined) => (value == null ? null : new Decimal(value));
const decOrZero = (value: string | null | undefined) => (value == null ? new Decimal(0) : new Decimal(value));

const goldModule: AssetModule = {
  assetClass: 'gold',
  async getSummary(userId) {
    const portfolio = await goldService.getPortfolio(userId);
    const value = new Decimal(portfolio.totalValue);
    const pnl = new Decimal(portfolio.totalUnrealizedPnl);
    return {
      assetClass: 'gold',
      value,
      invested: value.minus(pnl),
      pnl,
      holdings: portfolio.holdings.map((holding) => ({
        assetClass: 'gold',
        label: holding.goldType,
        value: dec(holding.currentValue),
        pnl: dec(holding.unrealizedPnl),
        pnlPct: dec(holding.roiPercent),
      })),
    };
  },
};

const stockModule: AssetModule = {
  assetClass: 'stock',
  async getSummary(userId) {
    const portfolio = await stockService.portfolio(userId);
    return {
      assetClass: 'stock',
      value: new Decimal(portfolio.totals.value),
      invested: new Decimal(portfolio.totals.invested),
      pnl: new Decimal(portfolio.totals.pnl),
      holdings: portfolio.holdings.map((holding) => ({
        assetClass: 'stock',
        label: holding.symbol,
        value: dec(holding.value),
        pnl: dec(holding.pnl),
        pnlPct: dec(holding.pnlPct),
      })),
    };
  },
};

const cryptoModule: AssetModule = {
  assetClass: 'crypto',
  async getSummary(userId) {
    const portfolio = await cryptoService.portfolio(userId);
    return {
      assetClass: 'crypto',
      value: new Decimal(portfolio.totals.valueVnd),
      invested: new Decimal(portfolio.totals.invested),
      pnl: new Decimal(portfolio.totals.pnl),
      holdings: portfolio.holdings.map((holding) => ({
        assetClass: 'crypto',
        label: `${holding.coinSymbol} (${holding.wallet})`,
        value: dec(holding.valueVnd),
        pnl: dec(holding.pnlVnd),
        pnlPct: dec(holding.pnlPct),
      })),
    };
  },
};

export const assetModules: AssetModule[] = [goldModule, stockModule, cryptoModule];

export async function getAssetSummaries(userId: string): Promise<AssetSummary[]> {
  const summaries = await Promise.all(assetModules.map((module) => module.getSummary(userId)));
  return summaries.map((summary) => ({
    ...summary,
    value: decOrZero(summary.value.toString()),
    invested: decOrZero(summary.invested.toString()),
    pnl: decOrZero(summary.pnl.toString()),
  }));
}
