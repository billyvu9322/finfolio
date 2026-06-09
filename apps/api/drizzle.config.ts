import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside the app, so it never imports config/env. Load the
// same repo-root env file (native, no dotenv) so DATABASE_URL is available.
function resolveEnvRootDir(fromDir: string): string {
  let currentDir = fromDir;
  while (true) {
    if (fs.existsSync(join(currentDir, 'pnpm-workspace.yaml'))) return currentDir;
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return fromDir;
    currentDir = parentDir;
  }
}

const rootDir = resolveEnvRootDir(dirname(fileURLToPath(import.meta.url)));
for (const file of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  const filePath = join(rootDir, file);
  if (fs.existsSync(filePath)) process.loadEnvFile(filePath);
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://finfolio:finfolio@localhost:5432/finfolio',
  },
  verbose: true,
  strict: true,
});
