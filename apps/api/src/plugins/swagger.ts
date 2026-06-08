import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/**
 * OpenAPI generation (NFR 4.4 — Swagger UI always up-to-date with the code).
 * Docs served at GET /docs.
 */
export const swaggerPlugin = fp(async (fastify) => {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'FinFolio API',
        description: 'Personal Capital Management API (MVP)',
        version: '1.0.0',
      },
      servers: [{ url: '/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });
});
