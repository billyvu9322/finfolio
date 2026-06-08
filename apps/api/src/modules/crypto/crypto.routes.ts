import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Crypto module (FR-CRYPTO). Scaffold only — endpoints not implemented yet.
 * JWT-guarded.
 *
 * Planned (SRS §7.2 — same CRUD pattern as gold, plus swap):
 *   GET/POST/PUT/DELETE /crypto/transactions
 *   POST                /crypto/swap        records sell+buy pair
 *   GET                 /crypto/portfolio   holdings per wallet/exchange
 *   GET                 /crypto/prices      CoinGecko cache (USD + VND)
 */
export const cryptoRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);
  // TODO(Sprint 4): implement crypto transaction CRUD + swap + CoinGecko integration.
};
