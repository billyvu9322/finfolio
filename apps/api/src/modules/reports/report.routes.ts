import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { reportsService } from './reports.service.js';

export const reportRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/pnl', {
    schema: { tags: ['reports'], querystring: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), response: { 200: z.object({ byAsset: z.array(z.object({ assetClass: z.string(), value: z.string(), invested: z.string(), pnl: z.string(), pnlPct: z.string() })), byMonth: z.array(z.object({ month: z.string(), aum: z.string(), delta: z.string() })) }) } },
  }, async (request, reply) => reply.send(await reportsService.pnlReport(request.user.sub, request.query.from, request.query.to)));

  fastify.get('/export/csv', {
    schema: { tags: ['reports'], querystring: z.object({ module: z.enum(['gold', 'stock']), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) },
  }, async (request, reply) => {
    const csv = await reportsService.exportCsv(request.user.sub, request.query.module, request.query.from, request.query.to);
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="finfolio-${request.query.module}.csv"`).send(csv);
  });

  fastify.get('/snapshot', {
    schema: { tags: ['reports'], querystring: z.object({ date: z.string() }), response: { 200: z.object({ snapshotDate: z.string(), totalValue: z.string(), totalInvested: z.string(), pnl: z.record(z.string(), z.unknown()) }) } },
  }, async (request, reply) => reply.send(await reportsService.snapshotOn(request.user.sub, request.query.date)));
};
