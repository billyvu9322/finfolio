import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { goldService } from './gold.service.js';
import { goldPriceService } from './gold-price.service.js';
import {
  goldPortfolioSchema,
  goldPriceSchema,
  goldTransactionBodySchema,
  goldTransactionParamsSchema,
  goldTransactionQuerySchema,
  goldTransactionSchema,
} from './gold.schema.js';

export const goldRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/transactions',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        querystring: goldTransactionQuerySchema,
        response: {
          200: z.object({
            data: z.array(goldTransactionSchema),
            pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request, reply) => reply.send(await goldService.listTransactions(request.user.sub, request.query)),
  );

  fastify.post(
    '/transactions',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        body: goldTransactionBodySchema,
        response: { 201: z.object({ transaction: goldTransactionSchema }) },
      },
    },
    async (request, reply) => {
      const transaction = await goldService.createTransaction(request.user.sub, request.body);
      return reply.code(201).send({ transaction });
    },
  );

  fastify.get(
    '/transactions/:id',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        params: goldTransactionParamsSchema,
        response: { 200: z.object({ transaction: goldTransactionSchema }) },
      },
    },
    async (request, reply) => {
      const transaction = await goldService.getTransaction(request.user.sub, request.params.id);
      return reply.send({ transaction });
    },
  );

  fastify.put(
    '/transactions/:id',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        params: goldTransactionParamsSchema,
        body: goldTransactionBodySchema,
        response: { 200: z.object({ transaction: goldTransactionSchema }) },
      },
    },
    async (request, reply) => {
      const transaction = await goldService.updateTransaction(
        request.user.sub,
        request.params.id,
        request.body,
      );
      return reply.send({ transaction });
    },
  );

  fastify.delete(
    '/transactions/:id',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        params: goldTransactionParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await goldService.deleteTransaction(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  fastify.get(
    '/portfolio',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        response: { 200: goldPortfolioSchema },
      },
    },
    async (request, reply) => reply.send(await goldService.getPortfolio(request.user.sub)),
  );

  fastify.get(
    '/prices',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        response: { 200: z.object({ prices: z.array(goldPriceSchema), updatedAt: z.date().nullable() }) },
      },
    },
    async (_request, reply) => reply.send(await goldService.getPrices()),
  );

  fastify.post(
    '/prices/refresh',
    {
      schema: {
        tags: ['gold'],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            total: z.number(),
            sources: z.array(
              z.object({
                key: z.string(),
                label: z.string(),
                count: z.number().optional(),
                error: z.string().optional(),
              }),
            ),
          }),
        },
      },
    },
    async (_request, reply) => reply.send(await goldPriceService.refreshGoldPrices()),
  );
};
