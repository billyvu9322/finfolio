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

const idParamSchema = z.object({ id: z.string().uuid() });

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
};
