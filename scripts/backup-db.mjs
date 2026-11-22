#!/usr/bin/env node
// Copia de seguridad de PostgreSQL (formato custom de pg_dump, comprimido) con rotación.
// Uso:
//   node scripts/backup-db.mjs                         → contenedor de desarrollo (appinity-claude-postgres)
//   node scripts/backup-db.mjs --container <nombre>    → otro contenedor (p. ej., el de producción)
//   node scripts/backup-db.mjs --keep 14               → conservar las 14 copias más recientes (por defecto 14)
// Las copias van a ./backups (fuera de Git). Contienen datos personales: guárdalas cifradas y con acceso restringido.
// Restaurar: docker exec -i <contenedor> pg_restore -U appinity_claude -d appinity_claude --clean --if-exists < backups/<archivo>.dump
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const container = option('container', 'appinity-claude-postgres');
const keep = Math.max(1, Number(option('keep', '14')) || 14);
const dir = join(process.cwd(), 'backups');
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(dir, `appinity_claude-${stamp}.dump`);
const dump = spawnSync('docker', ['exec', container, 'pg_dump', '-U', 'appinity_claude', '-d', 'appinity_claude', '-Fc'], {
  maxBuffer: 2 * 1024 * 1024 * 1024,
});
if (dump.status !== 0) {
  console.error(`pg_dump falló: ${dump.stderr.toString().trim() || `código ${dump.status}`}`);
  process.exit(1);
}
writeFileSync(file, dump.stdout);
console.log(`✔ Copia creada: ${file} (${(dump.stdout.length / 1024).toFixed(0)} KB)`);

const old = readdirSync(dir)
  .filter((f) => f.startsWith('appinity_claude-') && f.endsWith('.dump'))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .slice(keep);
for (const { f } of old) rmSync(join(dir, f));
if (old.length) console.log(`  Rotación: ${old.length} copia(s) antigua(s) eliminada(s); se conservan ${keep}`);
