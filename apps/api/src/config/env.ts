import 'dotenv/config';
import { z } from 'zod';

/**
 * Validated process environment. Fails fast on boot if anything required is missing.
 * See `.env.example` at the repo root for the full list.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // Comma-separated list of allowed CORS origins.
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // External integrations — optional at MVP scaffold stage.
  OPENAI_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  EXCHANGERATE_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  ENABLE_PRICE_SCHEDULER: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  // When set (and the dir exists), the API also serves the built web SPA from here
  // — used for the single-container Docker image. Unset in dev (web runs via Vite).
  WEB_STATIC_DIR: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export type Env = typeof env;
