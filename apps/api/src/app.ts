import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

import { corsOrigins, env } from './config/env.js';
import { authPlugin } from './plugins/auth.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { registerRoutes } from './routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod handles request validation + response serialization.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // --- Security & infra plugins ---
  await app.register(helmet);
  await app.register(cors, { origin: corsOrigins, credentials: true });
  await app.register(cookie, { secret: env.JWT_SECRET });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(authPlugin);
  await app.register(swaggerPlugin);

  // --- Centralized error handling ---
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'ValidationError', issues: error.flatten() });
    }
    // AuthError (and any error carrying a 4xx statusCode) is a client error.
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: error.name, message: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'InternalServerError', message: 'Something went wrong' });
  });

  // --- Routes (all under /v1) ---
  await app.register(registerRoutes, { prefix: '/v1' });

  return app;
}
