// pnpm db:generate -- --name=<nombre>: genera la migración con drizzle-kit y corrige los tipos PostGIS.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// drizzle-kit no exporta `bin.cjs` en su campo `exports` (0.31): se localiza junto a su entrada principal.
const bin = join(dirname(require.resolve('drizzle-kit')), 'bin.cjs');
execFileSync(process.execPath, [bin, 'generate', ...process.argv.slice(2).filter((a) => a !== '--')], { stdio: 'inherit' });
await import('./fix-migrations.mjs');
