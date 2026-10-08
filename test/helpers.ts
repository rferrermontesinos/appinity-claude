import { existsSync } from 'node:fs';
import type { Database } from '@appinity/database';
import { sql } from 'drizzle-orm';

/** Entorno de la API para tests: base de datos de test y prefijo de colas propio. */
export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl) throw new Error('Faltan TEST_DATABASE_URL o REDIS_URL');
  return {
    NODE_ENV: 'test',
    DEMO_MODE: 'true',
    DEV_AUTH_ENABLED: 'true',
    DEV_AUTH_SECRET: 'test-secret-for-dev-identity-0123456789',
    CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    API_HOST: '127.0.0.1',
    API_PORT: '3999',
    STORAGE_DIR: '.data/test-media',
    QUEUE_PREFIX: 'appinity-claude-test',
    ...overrides,
  };
}

/** Vacía todas las tablas de la base de datos de test (nunca se usa con la de desarrollo). */
export async function truncateAll(db: Database): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? '';
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('truncateAll solo se permite en la base de datos de test');
  await db.execute(sql`
    TRUNCATE TABLE user_item_profiles, user_item_observations, source_sync_runs, source_credentials,
      user_connections, provider_consents, catalog_external_ids, catalog_images, catalog_items,
      user_settings, user_profiles, users
    RESTART IDENTITY CASCADE`);
}
