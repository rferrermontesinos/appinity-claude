import { existsSync } from 'node:fs';
import { resetDatabase, runMigrations } from '@appinity/database';

/**
 * Prepara la base de datos de test (appinity_claude_test): la vacía y aplica las migraciones.
 * Nunca toca la base de datos de desarrollo.
 */
export default async function setup(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Falta TEST_DATABASE_URL (ejecuta pnpm setup y pnpm services:up)');
  if (!new URL(url).pathname.endsWith('_test')) throw new Error(`TEST_DATABASE_URL debe apuntar a una base *_test: ${url}`);
  process.env.NODE_ENV = 'test';
  await resetDatabase(url);
  await runMigrations(url);
}
