import Decimal from 'decimal.js';

import { findCoin } from '../crypto.coins.js';
import type { NormalizedTrade } from './ExchangeAdapter.js';

/**
 * Pure mapping from an exchange trade → a `crypto_transactions` insert. Kept in
 * its own module (no db/env imports) so it is unit-testable without triggering
 * env validation. `rate` is USD→VND FX at import time.
 */
export function normalizeTrade(
  userId: string,
  source: string,
  wallet: string,
  t: NormalizedTrade,
  rate: number,
) {
  const priceVnd = new Decimal(t.priceUsd).mul(rate);
  return {
    userId,
    coinId: findCoin(t.coinSymbol)?.coinId ?? t.coinSymbol.toLowerCase(),
    coinSymbol: t.coinSymbol,
    action: t.side,
    quantity: t.qty,
    priceVnd: priceVnd.toFixed(2),
    priceUsd: t.priceUsd,
    usdVndRate: String(rate),
    fee: t.fee,
    feeCurrency: t.feeCurrency,
    wallet,
    transactionAt: t.time,
    source,
    externalTradeId: t.externalTradeId,
  };
}
