import type { FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';

/** Shape of the signed JWT access-token payload. */
export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Pre-handler guard: rejects the request with 401 if no valid access token. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

/**
 * Registers @fastify/jwt and exposes `fastify.authenticate` for protected routes.
 */
export const authPlugin = fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
    }
  });
});
