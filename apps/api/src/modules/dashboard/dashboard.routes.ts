import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { dashboardService } from './dashboard.service.js';

export const dashboardRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/summary', {
    schema: { tags: ['dashboard'], response: { 200: z.object({ aum: z.string(), invested: z.string(), pnl: z.string(), pnlPct: z.string(), breakdown: z.array(z.object({ assetClass: z.string(), value: z.string(), pct: z.string(), pnl: z.string() })) }) } },
  }, async (request, reply) => reply.send(await dashboardService.summary(request.user.sub)));

  fastify.get('/growth', {
    schema: { tags: ['dashboard'], querystring: z.object({ period: z.enum(['7d', '1m', '3m', '1y', 'all']).default('1m') }), response: { 200: z.object({ data: z.array(z.object({ date: z.string(), value: z.string() })) }) } },
  }, async (request, reply) => reply.send(await dashboardService.growth(request.user.sub, request.query.period)));

  fastify.get('/recent-transactions', {
    schema: { tags: ['dashboard'], querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }), response: { 200: z.object({ data: z.array(z.object({ assetClass: z.string(), title: z.string(), subtitle: z.string(), action: z.string(), amount: z.string(), date: z.string() })) }) } },
  }, async (request, reply) => reply.send(await dashboardService.recentTransactions(request.user.sub, request.query.limit)));

  fastify.get('/top-holdings', {
    schema: { tags: ['dashboard'], querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }), response: { 200: z.object({ data: z.array(z.object({ assetClass: z.string(), label: z.string(), value: z.string(), pnlPct: z.string().nullable() })) }) } },
  }, async (request, reply) => reply.send(await dashboardService.topHoldings(request.user.sub, request.query.limit)));

  fastify.get('/top-movers', {
    schema: { tags: ['dashboard'], response: { 200: z.object({ gainers: z.array(z.object({ assetClass: z.string(), label: z.string(), pnlPct: z.string() })), losers: z.array(z.object({ assetClass: z.string(), label: z.string(), pnlPct: z.string() })) }) } },
  }, async (request, reply) => reply.send(await dashboardService.topMovers(request.user.sub)));

  fastify.post('/snapshot', {
    schema: { tags: ['dashboard'], response: { 200: z.object({ snapshotDate: z.string() }) } },
  }, async (request, reply) => reply.send(await dashboardService.createSnapshot(request.user.sub)));
};
