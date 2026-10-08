import pg from 'pg';

/**
 * Vacía por completo una base de datos de desarrollo o test (esquemas public y drizzle).
 * Se niega a actuar en producción o fuera de DEMO_MODE/test.
 */
export async function resetDatabase(connectionString: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('db:reset está prohibido en producción');
  const isTest = process.env.NODE_ENV === 'test';
  if (!isTest && process.env.DEMO_MODE !== 'true') throw new Error('db:reset solo se permite con DEMO_MODE=true');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}
