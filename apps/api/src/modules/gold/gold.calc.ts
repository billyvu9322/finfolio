import type { GoldTransaction } from '../../db/schema/index.js';

type GoldUnit = 'chi' | 'luong' | 'cay';

interface HoldingResult {
  goldType: string;
  quantityChi: string;
  dca: string;
  currentPrice: string;
  currentValue: string;
  unrealizedPnl: string;
  roiPercent: string;
}

interface PortfolioResult {
  holdings: HoldingResult[];
  totalValue: string;
  totalUnrealizedPnl: string;
}

interface Lot {
  quantity: bigint;
  cost: bigint;
}

const Q_SCALE = 10_000n;

export function toChi(quantity: string, unit: GoldUnit): string {
  const scaled = parseDecimal(quantity, 4);
  const multiplier = unit === 'chi' ? 1n : 10n;
  return formatDecimal(scaled * multiplier, 4);
}

export function calculateGoldPortfolio(
  transactions: GoldTransaction[],
  currentPrices: Record<string, string>,
): PortfolioResult {
  const lotsByType = new Map<string, Lot[]>();
  const sorted = [...transactions].sort(
    (a, b) => a.transactionAt.getTime() - b.transactionAt.getTime(),
  );

  for (const tx of sorted) {
    const quantity = parseDecimal(toChi(tx.quantity, tx.unit), 4);
    const lots = lotsByType.get(tx.goldType) ?? [];
    lotsByType.set(tx.goldType, lots);

    if (tx.action === 'buy') {
      const price = parseDecimal(tx.pricePerUnit, 2);
      const fee = parseDecimal(tx.fee, 2);
      lots.push({ quantity, cost: (quantity * price) / Q_SCALE + fee });
      continue;
    }

    let remaining = quantity;
    for (const lot of lots) {
      if (remaining === 0n) break;
      const used = remaining > lot.quantity ? lot.quantity : remaining;
      const usedCost = lot.quantity === used ? lot.cost : (lot.cost * used) / lot.quantity;
      lot.quantity -= used;
      lot.cost -= usedCost;
      remaining -= used;
    }
    if (remaining > 0n) {
      throw new Error(`Sell quantity exceeds holdings for ${tx.goldType}`);
    }
  }

  const holdings: HoldingResult[] = [];
  let totalValue = 0n;
  let totalUnrealizedPnl = 0n;

  for (const [goldType, lots] of lotsByType.entries()) {
    const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0n);
    if (quantity === 0n) continue;

    const cost = lots.reduce((sum, lot) => sum + lot.cost, 0n);
    const dca = (cost * Q_SCALE) / quantity;
    const currentPrice = parseDecimal(currentPrices[goldType] ?? formatDecimal(dca, 2), 2);
    const currentValue = (quantity * currentPrice) / Q_SCALE;
    const unrealizedPnl = currentValue - cost;
    const roiPercent = cost === 0n ? 0n : (unrealizedPnl * 10_000n) / cost;

    totalValue += currentValue;
    totalUnrealizedPnl += unrealizedPnl;
    holdings.push({
      goldType,
      quantityChi: formatDecimal(quantity, 4),
      dca: formatDecimal(dca, 2),
      currentPrice: formatDecimal(currentPrice, 2),
      currentValue: formatDecimal(currentValue, 2),
      unrealizedPnl: formatDecimal(unrealizedPnl, 2),
      roiPercent: formatDecimal(roiPercent, 2),
    });
  }

  return {
    holdings: holdings.sort((a, b) => a.goldType.localeCompare(b.goldType)),
    totalValue: formatDecimal(totalValue, 2),
    totalUnrealizedPnl: formatDecimal(totalUnrealizedPnl, 2),
  };
}

function parseDecimal(value: string, scale: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  const sign = whole.startsWith('-') ? -1n : 1n;
  const normalizedWhole = whole.replace('-', '') || '0';
  const padded = fraction.padEnd(scale, '0').slice(0, scale);
  return sign * (BigInt(normalizedWhole) * 10n ** BigInt(scale) + BigInt(padded || '0'));
}

function formatDecimal(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, '0');
  return `${sign}${whole}.${fraction}`;
}
