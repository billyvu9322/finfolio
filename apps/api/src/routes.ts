import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { pingDb } from './db/index.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { goldRoutes } from './modules/gold/gold.routes.js';
import { stockRoutes } from './modules/stock/stock.routes.js';
import { cryptoRoutes } from './modules/crypto/crypto.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { reportRoutes } from './modules/reports/report.routes.js';

/**
 * Mounts every feature module under /v1. Auth is public; the rest are
 * guarded inside their own plugins via `fastify.authenticate`.
 */
export const registerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        response: { 200: z.object({ status: z.string(), db: z.literal('ok') }) },
      },
    },
    async () => {
      await pingDb();
      return { status: 'ok', db: 'ok' as const };
    },
  );

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(goldRoutes, { prefix: '/gold' });
  await app.register(stockRoutes, { prefix: '/stocks' });
  await app.register(cryptoRoutes, { prefix: '/crypto' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });
  await app.register(reportRoutes, { prefix: '/reports' });
};
