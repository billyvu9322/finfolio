import cron, { type ScheduledTask } from 'node-cron';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { snapshotAllUsers } from '../modules/dashboard/snapshot.job.js';
import { SeedMarketDataProvider } from '../modules/stock/market/SeedMarketDataProvider.js';
import { refreshStockPrices } from '../modules/stock/market/refreshStockPrices.js';

export const schedulerPlugin = fp(async (fastify) => {
  if (env.ENABLE_PRICE_SCHEDULER) {
    const stockProvider = new SeedMarketDataProvider();
    const stockTask: ScheduledTask = cron.schedule('*/5 * * * *', () => {
      refreshStockPrices(stockProvider)
        .then((count) => fastify.log.info(`Stock prices refreshed: ${count}`))
        .catch((error) => fastify.log.error(error, 'Stock price refresh failed'));
    });
    const snapshotTask: ScheduledTask = cron.schedule('0 0 * * *', () => {
      snapshotAllUsers()
        .then((count) => fastify.log.info(`Snapshotted ${count} users`))
        .catch((error) => fastify.log.error(error, 'Snapshot job failed'));
    });
    const { goldPriceService } = await import('../modules/gold/gold-price.service.js');
    const goldTask: ScheduledTask = cron.schedule('0 12 * * *', () => {
      goldPriceService
        .refreshGoldPrices()
        .then((r: { total: number }) => fastify.log.info(`Gold prices refreshed: ${r.total}`))
        .catch((error: unknown) => fastify.log.error(error, 'Gold price refresh failed'));
    });
    fastify.addHook('onClose', async () => stockTask.stop());
    fastify.addHook('onClose', async () => snapshotTask.stop());
    fastify.addHook('onClose', async () => goldTask.stop());
    fastify.log.info('Stock price scheduler enabled (*/5 * * * *)');
    fastify.log.info('Portfolio snapshot scheduler enabled (0 0 * * *)');
    fastify.log.info('Gold price scheduler enabled (0 12 * * *)');
  } else {
    fastify.log.info('Price scheduler disabled');
  }

  // Phase 7 — optional incremental exchange sync. Independent of the price
  // scheduler; on-demand sync remains primary. Off by default.
  if (env.ENABLE_EXCHANGE_SYNC_CRON) {
    const { db } = await import('../db/index.js');
    const { exchangeConnections } = await import('../db/schema/index.js');
    const { connectionService } = await import('../modules/crypto/exchange/connection.service.js');
    const { eq } = await import('drizzle-orm');
    const syncTask: ScheduledTask = cron.schedule('*/30 * * * *', () => {
      void (async () => {
        const conns = await db.select().from(exchangeConnections).where(eq(exchangeConnections.status, 'active'));
        for (const c of conns) {
          await connectionService.sync(c.userId, c.id).catch((e) => fastify.log.error(e, 'Exchange sync failed'));
        }
      })();
    });
    fastify.addHook('onClose', async () => syncTask.stop());
    fastify.log.info('Exchange sync cron enabled (*/30 * * * *)');
  }
});
