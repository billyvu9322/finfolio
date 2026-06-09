import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  coinSchema,
  createCryptoTxSchema,
  cryptoPortfolioSchema,
  cryptoPricesSchema,
  cryptoTxSchema,
  fxQuerySchema,
  listCryptoTxQuerySchema,
  swapBodySchema,
  updateCryptoTxSchema,
} from './crypto.schema.js';
import { cryptoService } from './crypto.service.js';
import { connectionService } from './exchange/connection.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

const connMaskedSchema = z.object({
  id: z.string().uuid(),
  exchange: z.string(),
  label: z.string().nullable(),
  apiKeyMasked: z.string(),
  readOnly: z.boolean(),
  status: z.string(),
  lastSyncAt: z.date().nullable(),
  lastError: z.string().nullable(),
});

export const cryptoRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get(
    '/coins',
    { schema: { tags: ['crypto'], querystring: z.object({ q: z.string().optional() }), response: { 200: z.object({ coins: z.array(coinSchema) }) } } },
    async (request, reply) => reply.send(cryptoService.coins(request.query.q ?? '')),
  );

  fastify.get(
    '/transactions',
    {
      schema: {
        tags: ['crypto'],
        querystring: listCryptoTxQuerySchema,
        response: { 200: z.object({ data: z.array(cryptoTxSchema), pagination: z.object({ page: z.number(), limit: z.number(), total: z.number() }) }) },
      },
    },
    async (request, reply) => reply.send(await cryptoService.list(request.user.sub, request.query)),
  );

  fastify.post(
    '/transactions',
    { schema: { tags: ['crypto'], body: createCryptoTxSchema, response: { 201: cryptoTxSchema } } },
    async (request, reply) => reply.code(201).send(await cryptoService.create(request.user.sub, request.body)),
  );

  fastify.put(
    '/transactions/:id',
    { schema: { tags: ['crypto'], params: idParamSchema, body: updateCryptoTxSchema, response: { 200: cryptoTxSchema } } },
    async (request, reply) => reply.send(await cryptoService.update(request.user.sub, request.params.id, request.body)),
  );

  fastify.delete(
    '/transactions/:id',
    { schema: { tags: ['crypto'], params: idParamSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await cryptoService.remove(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  fastify.post(
    '/swap',
    { schema: { tags: ['crypto'], body: swapBodySchema, response: { 201: z.object({ source: cryptoTxSchema, dest: cryptoTxSchema }) } } },
    async (request, reply) => reply.code(201).send(await cryptoService.swap(request.user.sub, request.body)),
  );

  fastify.get(
    '/portfolio',
    { schema: { tags: ['crypto'], querystring: fxQuerySchema, response: { 200: cryptoPortfolioSchema } } },
    async (request, reply) => reply.send(await cryptoService.portfolio(request.user.sub, request.query.fx)),
  );

  fastify.get(
    '/prices',
    { schema: { tags: ['crypto'], querystring: fxQuerySchema, response: { 200: cryptoPricesSchema } } },
    async (request, reply) => reply.send(await cryptoService.prices(request.query.fx)),
  );

  // --- Phase 7: exchange connections (read-only key link + on-demand sync) ---
  fastify.post(
    '/connections',
    {
      schema: {
        tags: ['crypto'],
        body: z.object({
          exchange: z.enum(['binance']),
          label: z.string().max(80).optional(),
          apiKey: z.string().min(1),
          apiSecret: z.string().min(1),
        }),
        response: { 201: connMaskedSchema },
      },
    },
    async (request, reply) => reply.code(201).send(await connectionService.create(request.user.sub, request.body)),
  );

  fastify.get(
    '/connections',
    { schema: { tags: ['crypto'], response: { 200: z.object({ connections: z.array(connMaskedSchema) }) } } },
    async (request, reply) => reply.send(await connectionService.list(request.user.sub)),
  );

  fastify.delete(
    '/connections/:id',
    { schema: { tags: ['crypto'], params: idParamSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await connectionService.remove(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  fastify.post(
    '/connections/:id/sync',
    {
      schema: {
        tags: ['crypto'],
        params: idParamSchema,
        response: { 200: z.object({ imported: z.number(), skipped: z.number(), lastSyncAt: z.date() }) },
      },
    },
    async (request, reply) => reply.send(await connectionService.sync(request.user.sub, request.params.id)),
  );
};
