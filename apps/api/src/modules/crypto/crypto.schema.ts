import { z } from 'zod';
import Decimal from 'decimal.js';

export const cryptoActionSchema = z.enum(['buy', 'sell']);
export const priceCurrencySchema = z.enum(['VND', 'USDT']);
export const feeCurrencySchema = z.enum(['VND', 'USDT', 'COIN']);

const qty8 = z.coerce.number().positive().refine((value) => new Decimal(value).decimalPlaces() <= 8, {
  message: 'Quantity supports at most 8 decimals',
});

export const createCryptoTxSchema = z.object({
  coinId: z.string().min(1).max(80),
  coinSymbol: z.string().min(1).max(20).transform((symbol) => symbol.toUpperCase()),
  action: cryptoActionSchema,
  quantity: qty8,
  price: z.coerce.number().nonnegative(),
  priceCurrency: priceCurrencySchema.default('VND'),
  usdVndRate: z.coerce.number().positive().optional(),
  fee: z.coerce.number().nonnegative().default(0),
  feeCurrency: feeCurrencySchema.default('VND'),
  wallet: z.string().min(1).max(120),
  transactionAt: z.coerce.date().optional(),
});

export const swapBodySchema = z.object({
  sourceCoinId: z.string().min(1).max(80),
  sourceSymbol: z.string().min(1).max(20).transform((symbol) => symbol.toUpperCase()),
  sourceQty: qty8,
  destCoinId: z.string().min(1).max(80),
  destSymbol: z.string().min(1).max(20).transform((symbol) => symbol.toUpperCase()),
  destQty: qty8,
  valueVnd: z.coerce.number().positive(),
  wallet: z.string().min(1).max(120),
  transactionAt: z.coerce.date().optional(),
});

export const updateCryptoTxSchema = createCryptoTxSchema.partial().refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'At least one field is required',
});

export const listCryptoTxQuerySchema = z.object({
  coinSymbol: z.string().transform((symbol) => symbol.toUpperCase()).optional(),
  wallet: z.string().optional(),
  action: cryptoActionSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const fxQuerySchema = z.object({ fx: z.coerce.number().positive().optional() });

export const cryptoTxSchema = z.object({
  id: z.string().uuid(),
  coinId: z.string(),
  coinSymbol: z.string(),
  action: z.string(),
  quantity: z.string(),
  priceVnd: z.string(),
  priceUsd: z.string().nullable(),
  usdVndRate: z.string().nullable(),
  fee: z.string(),
  feeCurrency: z.string(),
  wallet: z.string(),
  transactionAt: z.date(),
  createdAt: z.date(),
});

export const cryptoHoldingSchema = z.object({
  coinSymbol: z.string(),
  wallet: z.string(),
  qty: z.string(),
  avgCostVnd: z.string(),
  avgCostUsd: z.string(),
  currentPriceVnd: z.string().nullable(),
  currentPriceUsd: z.string().nullable(),
  valueVnd: z.string().nullable(),
  valueUsd: z.string().nullable(),
  pnlVnd: z.string().nullable(),
  pnlPct: z.string().nullable(),
  change24hPct: z.string().nullable(),
  weightPct: z.string().nullable(),
});

export const cryptoPortfolioSchema = z.object({
  holdings: z.array(cryptoHoldingSchema),
  totals: z.object({
    valueVnd: z.string(),
    valueUsd: z.string(),
    invested: z.string(),
    pnl: z.string(),
    pnlPct: z.string(),
  }),
  fxRate: z.number(),
});

export const cryptoQuoteSchema = z.object({
  coinId: z.string(),
  symbol: z.string(),
  priceUsd: z.string(),
  priceVnd: z.string(),
  change24hPct: z.string(),
  source: z.string(),
});

export const cryptoPricesSchema = z.object({ quotes: z.array(cryptoQuoteSchema), fxRate: z.number() });
export const coinSchema = z.object({ coinId: z.string(), symbol: z.string(), name: z.string() });

export type CreateCryptoTxBody = z.infer<typeof createCryptoTxSchema>;
export type SwapBody = z.infer<typeof swapBodySchema>;
export type UpdateCryptoTxBody = z.infer<typeof updateCryptoTxSchema>;
export type ListCryptoTxQuery = z.infer<typeof listCryptoTxQuerySchema>;
