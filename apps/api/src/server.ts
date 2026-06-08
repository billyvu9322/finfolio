import { buildApp } from './app.js';
import { env } from './config/env.js';

async function main() {
  const app = await buildApp();

  const close = async () => {
    app.log.info('Shutting down...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
