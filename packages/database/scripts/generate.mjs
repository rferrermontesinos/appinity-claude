// pnpm db:generate -- --name=<nombre>: genera la migración con drizzle-kit y corrige los tipos PostGIS.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
execFileSync('npx', ['drizzle-kit', 'generate', ...args], { stdio: 'inherit', shell: true });
await import('./fix-migrations.mjs');
