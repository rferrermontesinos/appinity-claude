// pnpm db:generate -- --name=<nombre>: genera la migración con drizzle-kit y corrige los tipos PostGIS.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bin = require.resolve('drizzle-kit/bin.cjs');
execFileSync(process.execPath, [bin, 'generate', ...process.argv.slice(2)], { stdio: 'inherit' });
await import('./fix-migrations.mjs');
