import { pgEnum } from 'drizzle-orm/pg-core';

export const currencyEnum = pgEnum('currency', ['VND', 'USD']);
export const assetTypeEnum = pgEnum('asset_type', ['gold', 'stock', 'crypto']);

export const goldActionEnum = pgEnum('gold_action', ['buy', 'sell']);
export const goldUnitEnum = pgEnum('gold_unit', ['chi', 'luong', 'cay']);

export const stockActionEnum = pgEnum('stock_action', [
  'buy',
  'sell',
  'cash_dividend',
  'stock_dividend',
]);
export const exchangeEnum = pgEnum('exchange', ['HOSE', 'HNX', 'UPCOM']);

export const cryptoActionEnum = pgEnum('crypto_action', ['buy', 'sell', 'swap']);

export const dividendTypeEnum = pgEnum('dividend_type', ['cash', 'stock']);
