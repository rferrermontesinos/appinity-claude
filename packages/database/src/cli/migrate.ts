import { requireEnv } from '../env.js';
import { runMigrations } from '../migrate.js';

const url = requireEnv('DATABASE_URL');
const started = Date.now();
await runMigrations(url);
console.log(`✔ Migraciones aplicadas (${Date.now() - started} ms) en ${new URL(url).pathname.slice(1)}`);
