import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { stockPriceService } from './stock-price.service.js';
import {
  createStockTxSchema,
  listStockTxQuerySchema,
  ohlcQuerySchema,
  ohlcSchema,
  stockPortfolioSchema,
  stockPricesSchema,
  stockTxSchema,
  symbolSchema,
  updateStockTxSchema,
} from './stock.schema.js';
import { stockService } from './stock.service.js';
import { searchSymbols } from './stock.symbols.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const symbolParamSchema = z.object({ symbol: z.string().min(1).max(10) });

export const stockRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/symbols',
    {
      schema: {
        tags: ['stock'],
        querystring: z.object({ q: z.string().optional() }),
        response: { 200: z.object({ symbols: z.array(symbolSchema) }) },
      },
    },
    async (request, reply) => reply.send({ symbols: searchSymbols(request.query.q ?? '') }),
  );

  fastify.get(
    '/transactions',
    {
      schema: {
        tags: ['stock'],
        querystring: listStockTxQuerySchema,
        response: { 200: z.object({ data: z.array(stockTxSchema), pagination: z.object({ page: z.number(), limit: z.number(), total: z.number() }) }) },
      },
    },
    async (request, reply) => reply.send(await stockService.list(request.user.sub, request.query)),
  );

  fastify.post(
    '/transactions',
    { schema: { tags: ['stock'], body: createStockTxSchema, response: { 201: stockTxSchema } } },
    async (request, reply) => reply.code(201).send(await stockService.create(request.user.sub, request.body)),
  );

  fastify.put(
    '/transactions/:id',
    { schema: { tags: ['stock'], params: idParamSchema, body: updateStockTxSchema, response: { 200: stockTxSchema } } },
    async (request, reply) => reply.send(await stockService.update(request.user.sub, request.params.id, request.body)),
  );

  fastify.delete(
    '/transactions/:id',
    { schema: { tags: ['stock'], params: idParamSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await stockService.remove(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  fastify.get('/portfolio', { schema: { tags: ['stock'], response: { 200: stockPortfolioSchema } } }, async (request, reply) => reply.send(await stockService.portfolio(request.user.sub)));

  fastify.get('/prices', { schema: { tags: ['stock'], response: { 200: stockPricesSchema } } }, async (_request, reply) => reply.send(await stockService.prices()));

  fastify.post('/prices/refresh', { schema: { tags: ['stock'], response: { 200: z.object({ refreshed: z.number() }) } } }, async (_request, reply) => reply.send(await stockPriceService.refreshStockPrices()));

  fastify.get(
    '/:symbol/ohlc',
    { schema: { tags: ['stock'], params: symbolParamSchema, querystring: ohlcQuerySchema, response: { 200: ohlcSchema } } },
    async (request, reply) => reply.send(await stockService.ohlc(request.user.sub, request.params.symbol, request.query.range)),
  );
};
