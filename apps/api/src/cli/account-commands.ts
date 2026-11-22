import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Database } from '@appinity/database';
import { exportAccountData, findAccounts, type AccountMatch } from '@appinity/ingestion';
import type { AccountDeletion, AccountService } from '../auth/account.service.js';

/**
 * Peticiones de derechos que llegan por email (página /legal/eliminar-cuenta y política de privacidad): copia de los
 * datos (`pnpm account:export`) y eliminación de la cuenta (`pnpm account:delete`). Las ejecuta el titular donde corre la
 * API, después de comprobar que el email que escribe es el de la cuenta de Google.
 */
export interface AccountRequest {
  email?: string | undefined;
  handle?: string | undefined;
}

export type Print = (line: string) => void;

async function oneAccount(db: Database, request: AccountRequest): Promise<AccountMatch> {
  if (!request.email && !request.handle) throw new Error('Indica --email <email de la cuenta de Google> o --handle <handle>');
  const accounts = await findAccounts(db, request);
  if (!accounts.length) throw new Error('No hay ninguna cuenta con ese email o handle');
  if (accounts.length > 1) {
    throw new Error(`Hay ${accounts.length} cuentas que coinciden (${accounts.map((a) => `@${a.handle}`).join(', ')}): repite con --handle`);
  }
  return accounts[0]!;
}

/** Escribe la copia en JSON (por defecto en exports/, fuera de Git) y devuelve la ruta. */
export async function runAccountExport(
  db: Database,
  request: AccountRequest & { out?: string | undefined },
  print: Print,
  now = new Date(),
): Promise<{ file: string; handle: string }> {
  const account = await oneAccount(db, request);
  const data = await exportAccountData(db, account.userId, now);
  const file = resolve(request.out ?? join('exports', `appinity-${account.handle}-${now.toISOString().slice(0, 10)}.json`));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  print(`✔ Copia de los datos de @${account.handle}: ${file}`);
  print(`  ${data.tastes.length} gustos, ${data.evidence.length} evidencias, ${data.votes.length} votos y ${data.chat.conversations.length} conversaciones.`);
  print('  Contiene datos personales: envíala solo a esa persona, por un canal seguro, y bórrala después.');
  return { file, handle: account.handle };
}

/**
 * Sin `confirm`, solo enseña qué cuenta se eliminaría (no borra nada). Con `confirm` igual a su handle, la elimina como
 * «Eliminar mi cuenta» en la app. Las personas de la demo no se eliminan aquí.
 */
export async function runAccountDelete(
  db: Database,
  service: Pick<AccountService, 'deleteAccount'>,
  request: AccountRequest & { confirm?: string | undefined },
  print: Print,
): Promise<AccountDeletion | null> {
  const account = await oneAccount(db, request);
  if (account.dataset !== 'live') throw new Error(`@${account.handle} es una persona de la demo: se gestiona con pnpm db:seed`);
  const who = `@${account.handle}${account.emails.length ? ` (${account.emails.join(', ')})` : ''}`;
  if (!request.confirm) {
    print(`Se eliminaría la cuenta ${who}: perfil, gustos, votos, afinidades, amistades, chats y sesiones.`);
    print(`No se ha borrado nada. Para eliminarla, repite el comando con --confirm ${account.handle}`);
    return null;
  }
  if (request.confirm !== account.handle) throw new Error(`--confirm no coincide con el handle de la cuenta (${account.handle}): no se ha borrado nada`);
  const result = await service.deleteAccount(account.userId);
  print(`✔ Cuenta ${who} eliminada.`);
  if (result.disconnected.length) print(`  Fuentes desconectadas (con anulación del permiso en el proveedor): ${result.disconnected.join(', ')}`);
  if (result.failed.length) print(`  ⚠ No se pudieron desconectar: ${result.failed.join(', ')}. Sus datos se han borrado igualmente.`);
  print('  Contesta a la persona confirmando la eliminación (plazo máximo: un mes desde su petición).');
  return result;
}
