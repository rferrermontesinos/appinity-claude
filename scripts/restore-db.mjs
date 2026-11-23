#!/usr/bin/env node
// Comprobar o restaurar una copia de seguridad (fase B9).
// Uso:
//   pnpm db:restore backups/<copia>.dump.enc
//       → COMPRUEBA la copia: la restaura en una base temporal, cuenta lo que hay y la borra. No toca la base de la app.
//         Conviene hacerlo una vez al mes y siempre después de cambiar la clave.
//   pnpm db:restore backups/<copia>.dump.enc --confirm appinity_claude
//       → SUSTITUYE la base de la app por la copia. Antes, parar la API y el worker. Primero guarda una copia cifrada del
//         estado actual, y la base no se toca hasta que la copia está restaurada entera en otra.
//   --container <nombre>   contenedor de PostgreSQL (por defecto appinity-claude-postgres)
// Acepta también las copias antiguas sin cifrar (.dump). La clave es BACKUP_ENCRYPTION_KEY (.env).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BackupError, parseBackupKey, verifyBackup } from './lib/backup-crypto.mjs';
import { createBackup, createDatabase, DB_NAME, databaseExists, dropDatabase, openConnections, psql, restoreInto } from './lib/backup.mjs';

const CHECK_DB = `${DB_NAME}_restore_check`;
const RESTORING_DB = `${DB_NAME}_restoring`;
const PREVIOUS_DB = `${DB_NAME}_previous`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  allowPositionals: true,
  options: { container: { type: 'string' }, confirm: { type: 'string' } },
});
const [path] = positionals;
if (!path || positionals.length > 1 || (values.confirm !== undefined && values.confirm !== DB_NAME)) {
  console.error(`Uso: pnpm db:restore <copia> [--container nombre] [--confirm ${DB_NAME}]`);
  console.error('Sin --confirm solo se comprueba la copia en una base temporal; con él se sustituye la base de la app.');
  process.exit(1);
}
const container = values.container ?? 'appinity-claude-postgres';
const replace = values.confirm === DB_NAME;

/** Lo que hay en la base restaurada: solo recuentos, nunca datos de nadie. */
function summarize(database) {
  const migrations = Number(psql(container, database, 'SELECT count(*) FROM drizzle.__drizzle_migrations'));
  const journal = join(process.cwd(), 'packages/database/drizzle/meta/_journal.json');
  const expected = existsSync(journal) ? JSON.parse(readFileSync(journal, 'utf8')).entries.length : null;
  const people = psql(container, database, "SELECT dataset || ' ' || count(*) FROM users WHERE deleted_at IS NULL GROUP BY dataset ORDER BY dataset")
    .split('\n')
    .filter(Boolean)
    .join(', ');
  const [observations, votes, messages] = psql(
    container,
    database,
    'SELECT (SELECT count(*) FROM user_item_observations), (SELECT count(*) FROM item_votes), (SELECT count(*) FROM messages)',
  ).split('|');
  const postgis = psql(container, database, 'SELECT postgis_lib_version()');
  console.log(`  Migraciones: ${migrations}${expected === null ? '' : ` de las ${expected} del código actual`}`);
  console.log(`  Personas: ${people || 'ninguna'} · evidencias ${observations} · votos ${votes} · mensajes ${messages} · PostGIS ${postgis}`);
  if (expected !== null && migrations < expected)
    console.log('  ⚠ La copia es de una versión anterior: tras restaurarla, `pnpm db:migrate` aplica lo que falte.');
}

try {
  const key = process.env.BACKUP_ENCRYPTION_KEY ? parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY) : null;
  const verified = await verifyBackup(path, key);
  console.log(
    `✔ Copia íntegra: ${(verified.bytes / 1024).toFixed(0)} KB de volcado${verified.encrypted ? `, cifrada con la clave ${verified.fingerprint}` : ' (antigua, sin cifrar)'}`,
  );

  if (!replace) {
    dropDatabase(container, CHECK_DB);
    createDatabase(container, CHECK_DB);
    try {
      await restoreInto({ container, database: CHECK_DB, path, key });
      console.log(`✔ Restaurada en una base temporal (${CHECK_DB}):`);
      summarize(CHECK_DB);
    } finally {
      dropDatabase(container, CHECK_DB);
    }
    console.log(`✔ Base temporal borrada. La base de la app (${DB_NAME}) no se ha tocado.`);
  } else {
    if (!key) throw new BackupError('Para sustituir la base hace falta BACKUP_ENCRYPTION_KEY: antes se guarda una copia cifrada del estado actual.');
    if (databaseExists(container, PREVIOUS_DB)) {
      throw new BackupError(`Existe ${PREVIOUS_DB} de una restauración que no terminó: revísala a mano antes de seguir (puede ser la única copia).`);
    }
    const busy = openConnections(container, DB_NAME);
    if (busy) throw new BackupError(`Hay ${busy} conexión(es) abiertas a ${DB_NAME}: para la API y el worker y vuelve a intentarlo.`);
    const before = await createBackup({ container, key, dir: join(process.cwd(), 'backups') });
    console.log(`✔ Copia del estado actual, por si hay que volver atrás: ${before.file}`);
    dropDatabase(container, RESTORING_DB);
    createDatabase(container, RESTORING_DB);
    try {
      await restoreInto({ container, database: RESTORING_DB, path, key });
    } catch (error) {
      dropDatabase(container, RESTORING_DB);
      throw error;
    }
    console.log('✔ Copia restaurada entera en una base nueva:');
    summarize(RESTORING_DB);
    const late = openConnections(container, DB_NAME);
    if (late) {
      dropDatabase(container, RESTORING_DB);
      throw new BackupError(`Se ha abierto alguna conexión a ${DB_NAME} durante la restauración (${late}); no se ha cambiado nada.`);
    }
    psql(container, 'postgres', `ALTER DATABASE "${DB_NAME}" RENAME TO "${PREVIOUS_DB}"`);
    try {
      psql(container, 'postgres', `ALTER DATABASE "${RESTORING_DB}" RENAME TO "${DB_NAME}"`);
    } catch (error) {
      psql(container, 'postgres', `ALTER DATABASE "${PREVIOUS_DB}" RENAME TO "${DB_NAME}"`);
      throw error;
    }
    dropDatabase(container, PREVIOUS_DB);
    console.log(`✔ ${DB_NAME} sustituida por la copia. Arranca la API y el worker.`);
  }
} catch (error) {
  console.error(error instanceof BackupError ? `✖ ${error.message}` : error);
  process.exit(1);
}
