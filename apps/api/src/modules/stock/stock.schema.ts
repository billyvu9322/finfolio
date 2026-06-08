import { z } from 'zod';

export const exchangeSchema = z.enum(['HOSE', 'HNX', 'UPCOM']);
export const stockActionSchema = z.enum(['buy', 'sell', 'cash_dividend', 'stock_dividend']);

export const createStockTxSchema = z.object({
  symbol: z.string().min(1).max(10).transform((value) => value.toUpperCase()),
  exchange: exchangeSchema.optional(),
  action: stockActionSchema,
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
  brokerageFee: z.coerce.number().nonnegative().optional(),
  tax: z.coerce.number().nonnegative().optional(),
  broker: z.string().max(80).optional(),
  transactionAt: z.coerce.date().optional(),
});

export const updateStockTxSchema = createStockTxSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const listStockTxQuerySchema = z.object({
  symbol: z.string().transform((value) => value.toUpperCase()).optional(),
  action: stockActionSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const ohlcQuerySchema = z.object({
  range: z.enum(['1m', '3m', '6m']).default('3m'),
});

export const stockTxSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  exchange: exchangeSchema,
  action: stockActionSchema,
  quantity: z.number(),
  price: z.string(),
  brokerageFee: z.string(),
  tax: z.string(),
  broker: z.string().nullable(),
  transactionAt: z.date(),
  createdAt: z.date(),
});

export const stockHoldingSchema = z.object({
  symbol: z.string(),
  exchange: exchangeSchema,
  qty: z.string(),
  avgCost: z.string(),
  currentPrice: z.string().nullable(),
  value: z.string().nullable(),
  weightPct: z.string().nullable(),
  pnl: z.string().nullable(),
  pnlPct: z.string().nullable(),
  dividendIncome: z.string(),
});

export const stockPortfolioSchema = z.object({
  holdings: z.array(stockHoldingSchema),
  totals: z.object({
    value: z.string(),
    invested: z.string(),
    pnl: z.string(),
    pnlPct: z.string(),
    dividendIncome: z.string(),
  }),
});

export const stockPriceSchema = z.object({
  symbol: z.string(),
  source: z.string(),
  price: z.string().nullable(),
  currency: z.string(),
  fetchedAt: z.date(),
});

export const stockPricesSchema = z.object({
  prices: z.array(stockPriceSchema),
  updatedAt: z.date().nullable(),
  stale: z.boolean(),
});

export const candleSchema = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

export const ohlcSchema = z.object({
  candles: z.array(candleSchema),
  markers: z.array(z.object({ time: z.string(), action: stockActionSchema, price: z.string() })),
});

export const symbolSchema = z.object({
  symbol: z.string(),
  exchange: exchangeSchema,
  name: z.string(),
});

export type CreateStockTxBody = z.infer<typeof createStockTxSchema>;
export type UpdateStockTxBody = z.infer<typeof updateStockTxSchema>;
export type ListStockTxQuery = z.infer<typeof listStockTxQuerySchema>;
