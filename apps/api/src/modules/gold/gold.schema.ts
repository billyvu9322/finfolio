import { z } from 'zod';

export const goldActionSchema = z.enum(['buy', 'sell']);
export const goldUnitSchema = z.enum(['chi', 'luong', 'cay']);

export const goldTransactionBodySchema = z.object({
  goldType: z.string().min(1).max(80),
  action: goldActionSchema,
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Quantity must have up to 4 decimals'),
  unit: goldUnitSchema,
  pricePerUnit: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must have up to 2 decimals'),
  fee: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  storage: z.string().min(1).max(160),
  note: z.string().max(500).nullable().optional(),
  transactionAt: z.coerce.date().optional(),
});

export const goldTransactionParamsSchema = z.object({ id: z.string().uuid() });

export const goldTransactionQuerySchema = z.object({
  goldType: z.string().optional(),
  action: goldActionSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const goldTransactionSchema = z.object({
  id: z.string().uuid(),
  goldType: z.string(),
  action: goldActionSchema,
  quantity: z.string(),
  unit: goldUnitSchema,
  pricePerUnit: z.string(),
  fee: z.string(),
  storage: z.string(),
  note: z.string().nullable(),
  transactionAt: z.date(),
  createdAt: z.date(),
});

export const goldPortfolioSchema = z.object({
  holdings: z.array(
    z.object({
      goldType: z.string(),
      quantityChi: z.string(),
      dca: z.string(),
      currentPrice: z.string(),
      currentValue: z.string(),
      unrealizedPnl: z.string(),
      roiPercent: z.string(),
    }),
  ),
  totalValue: z.string(),
  totalUnrealizedPnl: z.string(),
});

export const goldPriceSchema = z.object({
  symbol: z.string(),
  priceBuy: z.string().nullable(),
  priceSell: z.string().nullable(),
  currency: z.string(),
  source: z.string(),
  fetchedAt: z.date(),
  stale: z.boolean(),
});

export type GoldTransactionBody = z.infer<typeof goldTransactionBodySchema>;
export type GoldTransactionQuery = z.infer<typeof goldTransactionQuerySchema>;
