import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/env.js';
import {
  authResponseSchema,
  loginBodySchema,
  registerBodySchema,
  userPublicSchema,
} from './auth.schema.js';
import { authService, AuthError } from './auth.service.js';

const REFRESH_COOKIE = 'refresh_token';

const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/v1/auth',
};

// Stricter rate limit for auth endpoints (NFR 4.2: 5 req/min).
const authRateLimit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

export const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/register',
    {
      ...authRateLimit,
      schema: {
        tags: ['auth'],
        body: registerBodySchema,
        response: { 201: authResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password, displayName } = request.body;
      const user = await authService.register(email, password, displayName);
      const accessToken = await reply.jwtSign({ sub: user.id, email: user.email });
      const { token } = await authService.issueRefreshToken(user.id);
      reply.setCookie(REFRESH_COOKIE, token, cookieOpts);
      return reply.code(201).send({ accessToken, user });
    },
  );

  fastify.post(
    '/login',
    {
      ...authRateLimit,
      schema: {
        tags: ['auth'],
        body: loginBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await authService.verifyCredentials(email, password);
      const accessToken = await reply.jwtSign({ sub: user.id, email: user.email });
      const { token } = await authService.issueRefreshToken(user.id);
      reply.setCookie(REFRESH_COOKIE, token, cookieOpts);
      return reply.send({ accessToken, user: authService.toPublic(user) });
    },
  );

  fastify.post(
    '/refresh',
    {
      schema: { tags: ['auth'], response: { 200: z.object({ accessToken: z.string() }) } },
    },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw new AuthError(401, 'Missing refresh token');
      const user = await authService.validateRefreshToken(token);
      // Rotate: revoke old, issue new.
      await authService.revokeRefreshToken(token);
      const { token: next } = await authService.issueRefreshToken(user.id);
      reply.setCookie(REFRESH_COOKIE, next, cookieOpts);
      const accessToken = await reply.jwtSign({ sub: user.id, email: user.email });
      return reply.send({ accessToken });
    },
  );

  fastify.post(
    '/logout',
    { schema: { tags: ['auth'], response: { 204: z.null() } } },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      if (token) await authService.revokeRefreshToken(token);
      reply.clearCookie(REFRESH_COOKIE, cookieOpts);
      return reply.code(204).send();
    },
  );

  fastify.get(
    '/me',
    {
      onRequest: [fastify.authenticate],
      schema: {
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        response: { 200: userPublicSchema },
      },
    },
    async (request, reply) => {
      const user = await authService.validateAccessUser(request.user.sub);
      return reply.send(user);
    },
  );
};
