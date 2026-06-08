import cron, { type ScheduledTask } from 'node-cron';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { snapshotAllUsers } from '../modules/dashboard/snapshot.job.js';
import { SeedMarketDataProvider } from '../modules/stock/market/SeedMarketDataProvider.js';
import { refreshStockPrices } from '../modules/stock/market/refreshStockPrices.js';

export const schedulerPlugin = fp(async (fastify) => {
  if (!env.ENABLE_PRICE_SCHEDULER) {
    fastify.log.info('Price scheduler disabled');
    return;
  }

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
  fastify.addHook('onClose', async () => stockTask.stop());
  fastify.addHook('onClose', async () => snapshotTask.stop());
  fastify.log.info('Stock price scheduler enabled (*/5 * * * *)');
  fastify.log.info('Portfolio snapshot scheduler enabled (0 0 * * *)');
});
