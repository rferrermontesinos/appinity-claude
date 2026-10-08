import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Aplica las migraciones versionadas pendientes. Es idempotente. */
export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDatabase(connectionString, { max: 1, applicationName: 'appinity-claude-migrate' });
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await handle.close();
  }
}
