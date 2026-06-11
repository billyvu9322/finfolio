import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

function resolveEnvRootDir(fromDir: string): string {
  let currentDir = fromDir;
  while (true) {
    if (fs.existsSync(join(currentDir, "pnpm-workspace.yaml")))
      return currentDir;
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return fromDir;
    currentDir = parentDir;
  }
}

const rootDir = resolveEnvRootDir(dirname(fileURLToPath(import.meta.url)));
const nodeEnv = process.env.NODE_ENV ?? "development";

function loadEnvFallback(filePath: string) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const name = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^("|')|("|')$/g, "");
    if (process.env[name] == null) process.env[name] = value;
  }
}

for (const file of [`.env.${nodeEnv}`, ".env"]) {
  const filePath = join(rootDir, file);
  if (fs.existsSync(filePath)) {
    process.loadEnvFile(filePath);
    loadEnvFallback(filePath);
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(6001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .optional(),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("cx/gpt-5.5"),
  COINGECKO_API_KEY: z.string().optional(),
  EXCHANGERATE_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  ENABLE_PRICE_SCHEDULER: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
  WEB_STATIC_DIR: z.string().optional(),

  // Allowed browser origins for CORS (comma-separated). Dev: the Vite SPA on
  // :5173. Prod: same-origin (API serves the SPA), so usually unneeded.
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((s) => s.trim()).filter(Boolean)),

  // Phase 7 — exchange sync. AES-256-GCM key (base64 32 bytes); required only
  // when linking exchange API keys (validated lazily in lib/crypto-secret).
  ENCRYPTION_KEY: z.string().optional(),
  ENABLE_EXCHANGE_SYNC_CRON: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),

  // Gold price crawl — browser UA so bot-blocking sources (e.g. Quang Hạnh) accept the request.
  GOLD_CRAWL_USER_AGENT: z
    .string()
    .default(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
export type AppEnv = typeof env;
