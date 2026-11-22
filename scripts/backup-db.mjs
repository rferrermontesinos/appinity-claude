#!/usr/bin/env node
// Copia de seguridad CIFRADA de PostgreSQL (fase B9): pg_dump en formato custom, cifrado con AES-256-GCM, y rotación.
// Uso:
//   pnpm db:backup                                   → contenedor de desarrollo (appinity-claude-postgres)
//   pnpm db:backup --keep 14                         → conservar las 14 copias más recientes (por defecto 14)
//   pnpm db:backup --copy-to "D:\Drive\appinity"     → además, copiarla a otra carpeta (otro disco o una carpeta que se
//                                                      sincroniza con la nube), con la misma rotación. BACKUP_COPY_TO en
//                                                      .env hace lo mismo sin el argumento (para la tarea programada)
//   node --env-file=.env.production scripts/backup-db.mjs --container <contenedor-postgres>   → producción
// La clave es BACKUP_ENCRYPTION_KEY (la crea `pnpm setup`). Guárdala también fuera de este equipo: sin ella no se puede
// restaurar. Las copias van a ./backups (fuera de Git). Comprobar o restaurar una copia: `pnpm db:restore`.
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BackupError, keyFingerprint, parseBackupKey } from './lib/backup-crypto.mjs';
import { copyBackup, createBackup, rotateBackups } from './lib/backup.mjs';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { container: { type: 'string' }, keep: { type: 'string' }, 'copy-to': { type: 'string' } },
});
const container = values.container ?? 'appinity-claude-postgres';
const keep = Number(values.keep ?? '14');
if (!Number.isInteger(keep) || keep < 1 || keep > 365) {
  console.error('Uso: pnpm db:backup [--container nombre] [--keep 1-365] [--copy-to carpeta]');
  process.exit(1);
}

try {
  const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  const dir = join(process.cwd(), 'backups');
  const { file, bytes } = await createBackup({ container, key, dir });
  console.log(`✔ Copia cifrada: ${file} (${(bytes / 1024).toFixed(0)} KB, clave ${keyFingerprint(key).toString('hex')})`);
  const folders = [dir];
  const copyTo = values['copy-to'] ?? process.env.BACKUP_COPY_TO?.trim();
  if (copyTo) {
    const copy = copyBackup(file, resolve(copyTo));
    console.log(`✔ Copiada a ${copy}`);
    folders.push(resolve(copyTo));
  }
  for (const folder of folders) {
    const { removed, plaintext } = rotateBackups(folder, keep);
    if (removed) console.log(`  Rotación en ${folder}: ${removed} copia(s) antigua(s) eliminada(s); se conservan ${keep}.`);
    if (plaintext) console.log(`  ⚠ ${folder} aún tiene ${plaintext} copia(s) sin cifrar de antes: la rotación las irá borrando.`);
  }
} catch (error) {
  console.error(error instanceof BackupError ? `✖ ${error.message}` : error);
  process.exit(1);
}
