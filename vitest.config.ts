import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Carga .env local (pnpm setup) para las URLs de servicios de test.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/test/**/*.int.test.ts', 'apps/api/test/**/*.int.test.ts', 'workers/*/test/**/*.int.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          environment: 'node',
          globalSetup: ['./test/integration-setup.ts'],
          // Comparten una base de datos de test: se ejecutan en serie.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
