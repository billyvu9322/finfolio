import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['tests/**/*.test.ts', 'src/server.ts', 'src/db/schema/**'],
      // Enable once repo-wide coverage reaches launch gate:
      // thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
