import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Stock module (FR-STOCK). Scaffold only — endpoints not implemented yet.
 * JWT-guarded.
 *
 * Planned (SRS §7.2 — same CRUD pattern as gold):
 *   GET/POST/PUT/DELETE /stocks/transactions
 *   GET                 /stocks/portfolio   holdings + WAVG P&L
 *   GET                 /stocks/prices      cached HOSE/HNX prices
 */
export const stockRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);
  // TODO(Sprint 3): implement stock transaction CRUD + WAVG engine.
};
