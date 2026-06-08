import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Gold module (FR-GOLD). Scaffold only — endpoints not implemented yet.
 * All routes are JWT-guarded via the `authenticate` hook below.
 *
 * Planned (SRS §7.2):
 *   GET    /gold/transactions      list (filter + pagination)
 *   POST   /gold/transactions      create
 *   PUT    /gold/transactions/:id  update (recompute DCA/P&L)
 *   DELETE /gold/transactions/:id  delete (recompute DCA/P&L)
 *   GET    /gold/portfolio         holdings + total P&L (WAVG/DCA)
 *   GET    /gold/prices            cached SJC/PNJ/DOJI prices
 */
export const goldRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);
  // TODO(Sprint 2): implement gold transaction CRUD + DCA engine.
};
