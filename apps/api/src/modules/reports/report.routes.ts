import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Reports module (FR-REPORT). Scaffold only — endpoints not implemented yet.
 * JWT-guarded.
 *
 * Planned (SRS §7.2):
 *   GET /reports/pnl?from=&to=   P&L summary by asset / month
 *   GET /reports/export/csv      transaction history CSV
 */
export const reportRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);
  // TODO(Sprint 5): P&L report + CSV export.
};
