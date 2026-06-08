import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Dashboard module (FR-DASH). Scaffold only — endpoints not implemented yet.
 * JWT-guarded.
 *
 * Planned (SRS §7.2):
 *   GET /dashboard/summary           aum, invested, pnl, breakdown
 *   GET /dashboard/growth?period=1m  AUM growth series
 */
export const dashboardRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);
  // TODO(Sprint 5): aggregate cross-asset AUM/P&L + growth series.
};
