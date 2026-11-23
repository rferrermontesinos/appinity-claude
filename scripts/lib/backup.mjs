// Copias de seguridad de PostgreSQL con Docker (fase B9): volcado cifrado, rotación y restauración en una base nueva.
// Lo usan scripts/backup-db.mjs y scripts/restore-db.mjs. Todo va por `docker exec` al contenedor de PostgreSQL, como
// en desarrollo (appinity-claude-postgres) y en la pila de producción; el usuario y la base son `appinity_claude`.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, createWriteStream, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BackupError, encryptTransform, readBackupInto } from './backup-crypto.mjs';

export const DB_USER = 'appinity_claude';
export const DB_NAME = 'appinity_claude';
/** Copias que cuentan para la rotación: las cifradas (.dump.enc) y las antiguas sin cifrar (.dump). */
const BACKUP_FILE = /^appinity_claude-.+\.dump(\.enc)?$/;

/** Ejecuta `docker …` y devuelve la salida; con `check`, un código distinto de 0 es un error con su mensaje. */
export function docker(args, { check = true } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new BackupError(`No se pudo ejecutar docker: ${result.error.message}`);
  if (check && result.status !== 0) throw new BackupError((result.stderr || result.stdout || `docker ${args[0]}: código ${result.status}`).trim());
  return result;
}

/** Una consulta en psql (salida sin cabeceras, columnas separadas por «|»). */
export function psql(container, database, sql) {
  return docker(['exec', container, 'psql', '-U', DB_USER, '-d', database, '-v', 'ON_ERROR_STOP=1', '-AtX', '-c', sql]).stdout.trim();
}

/** Espera a que termine un proceso; un fallo al lanzarlo (p. ej., sin docker) también llega aquí. */
function finished(child) {
  const promise = new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new BackupError(`No se pudo ejecutar docker: ${error.message}`)));
    child.once('close', (code) => resolve(code));
  });
  // Puede fallar antes de que alguien la espere (mientras corre el pipeline): no es un rechazo sin atender.
  promise.catch(() => undefined);
  return promise;
}

function collect(stream) {
  let text = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    if (text.length < 64 * 1024) text += chunk;
  });
  return () => text.trim();
}

/** `appinity_claude-2026-11-22T16-50-00-000Z.dump.enc`: el nombre ordena las copias por fecha. */
export function backupFileName(now = new Date()) {
  return `appinity_claude-${now.toISOString().replace(/[:.]/g, '-')}.dump.enc`;
}

/**
 * Volcado de `database` (pg_dump, formato custom) cifrado en `dir`. Se escribe en un `.part` y solo se renombra si
 * pg_dump termina bien: una copia a medias nunca cuenta como copia.
 */
export async function createBackup({ container, key, dir, database = DB_NAME, now = new Date() }) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, backupFileName(now));
  const partial = `${file}.part`;
  const child = spawn('docker', ['exec', container, 'pg_dump', '-U', DB_USER, '-d', database, '-Fc'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderr = collect(child.stderr);
  const exited = finished(child);
  try {
    await pipeline(child.stdout, encryptTransform(key), createWriteStream(partial));
    const code = await exited;
    if (code !== 0) throw new BackupError(`pg_dump falló: ${stderr() || `código ${code}`}`);
    renameSync(partial, file);
    return { file, bytes: statSync(file).size };
  } catch (error) {
    await exited.catch(() => undefined);
    rmSync(partial, { force: true });
    throw error;
  }
}

/** Copia el fichero a otra carpeta (también vía `.part`) y devuelve la ruta. */
export function copyBackup(file, dir) {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, file.split(/[\\/]/).pop());
  copyFileSync(file, `${target}.part`);
  renameSync(`${target}.part`, target);
  return target;
}

/**
 * Conserva las `keep` copias más recientes de la carpeta y borra el resto, también las antiguas sin cifrar: la
 * política de privacidad promete que lo borrado desaparece de las copias en 14 días.
 */
export function rotateBackups(dir, keep) {
  const backups = readdirSync(dir)
    .filter((name) => BACKUP_FILE.test(name))
    .sort()
    .reverse();
  const removed = backups.slice(keep);
  for (const name of removed) rmSync(join(dir, name));
  return { removed: removed.length, kept: backups.length - removed.length, plaintext: backups.slice(0, keep).filter((name) => name.endsWith('.dump')).length };
}

/** Restaura la copia en `database`, que tiene que existir y estar vacía. Todo o nada (`--single-transaction`). */
export async function restoreInto({ container, database, path, key }) {
  const child = spawn('docker', ['exec', '-i', container, 'pg_restore', '-U', DB_USER, '-d', database, '--single-transaction', '--exit-on-error'], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  const stderr = collect(child.stderr);
  const exited = finished(child);
  let feedError;
  try {
    await readBackupInto(path, key, child.stdin);
  } catch (error) {
    feedError = error;
    child.stdin.destroy();
  }
  const code = await exited;
  // Una copia que no pasa la comprobación manda sobre lo que diga pg_restore de una entrada cortada.
  if (feedError instanceof BackupError) throw feedError;
  // Si pg_restore se para, escribir en su entrada da EPIPE: el error útil es el suyo.
  if (code !== 0) throw new BackupError(`pg_restore falló: ${stderr() || `código ${code}`}`);
  if (feedError) throw feedError;
}

export function databaseExists(container, database) {
  return psql(container, 'postgres', `SELECT 1 FROM pg_database WHERE datname = '${database}'`) === '1';
}

/** Conexiones abiertas a la base (la API y el worker mientras están en marcha). */
export function openConnections(container, database) {
  return Number(psql(container, 'postgres', `SELECT count(*) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid()`));
}

export function dropDatabase(container, database) {
  psql(container, 'postgres', `DROP DATABASE IF EXISTS "${database}"`);
}

export function createDatabase(container, database) {
  psql(container, 'postgres', `CREATE DATABASE "${database}" OWNER ${DB_USER}`);
}
