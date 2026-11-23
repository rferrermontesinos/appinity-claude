// Cifrado de las copias de seguridad (fase B9): AES-256-GCM con la clave BACKUP_ENCRYPTION_KEY, sin dependencias.
//
// Formato de un fichero .dump.enc (versión 1):
//   «APPBAK01» (8 bytes) · huella de la clave (8) · IV (12) · datos cifrados · etiqueta GCM (16)
// La cabecera (versión y huella) va autenticada como datos adicionales: si se toca un solo byte del fichero, la
// comprobación falla. La huella permite decir «esta copia se cifró con otra clave» sin revelar nada de la clave.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAGIC = Buffer.from('APPBAK01', 'ascii');
const FINGERPRINT_BYTES = 8;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD_BYTES = MAGIC.length + FINGERPRINT_BYTES;
export const HEADER_BYTES = AAD_BYTES + IV_BYTES;
/** Los volcados de pg_dump en formato custom empiezan así. */
const PGDUMP_MAGIC = 'PGDMP';

export class BackupError extends Error {}

/** La clave: 32 bytes en base64 (como la crea `pnpm setup` o `openssl rand -base64 32`). */
export function parseBackupKey(value) {
  const text = (value ?? '').trim();
  if (!text) {
    throw new BackupError(
      'Falta BACKUP_ENCRYPTION_KEY: ejecuta `pnpm setup` (la crea en .env) y guárdala también fuera de este equipo, ' +
        'por ejemplo en un gestor de contraseñas. Sin ella no se puede restaurar ninguna copia.',
    );
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) throw new BackupError('BACKUP_ENCRYPTION_KEY tiene que ser 32 bytes en base64 (44 caracteres).');
  return Buffer.from(text, 'base64');
}

export function keyFingerprint(key) {
  return createHash('sha256').update('appinity-backup-key-v1').update(key).digest().subarray(0, FINGERPRINT_BYTES);
}

/** Paso de `stream.pipeline` que cifra lo que recibe y añade cabecera y etiqueta. */
export function encryptTransform(key) {
  const iv = randomBytes(IV_BYTES);
  const aad = Buffer.concat([MAGIC, keyFingerprint(key)]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  return async function* encrypt(source) {
    yield Buffer.concat([aad, iv]);
    for await (const chunk of source) {
      const out = cipher.update(chunk);
      if (out.length) yield out;
    }
    const last = cipher.final();
    if (last.length) yield last;
    yield cipher.getAuthTag();
  };
}

/** Cabecera y etiqueta de una copia cifrada. Las copias antiguas sin cifrar (`.dump`) dan `encrypted: false`. */
export async function inspectBackup(path) {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(Math.min(size, HEADER_BYTES));
    await handle.read(head, 0, head.length, 0);
    if (head.subarray(0, PGDUMP_MAGIC.length).toString('latin1') === PGDUMP_MAGIC) return { encrypted: false, size };
    if (size < HEADER_BYTES + TAG_BYTES || !head.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new BackupError(`${path} no es una copia de APPINITY (ni cifrada ni de pg_dump).`);
    }
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
    return {
      encrypted: true,
      size,
      aad: head.subarray(0, AAD_BYTES),
      fingerprint: head.subarray(MAGIC.length, AAD_BYTES),
      iv: head.subarray(AAD_BYTES, HEADER_BYTES),
      tag,
    };
  } finally {
    await handle.close();
  }
}

/**
 * Lee la copia y escribe el volcado de pg_dump en `sink` (descifrándolo si está cifrada). GCM solo confirma la
 * autenticidad al final: el error de una copia alterada llega cuando ya se ha escrito todo. Por eso, antes de restaurar,
 * se comprueba entera con `verifyBackup` (sin escribir nada en disco).
 */
export async function readBackupInto(path, key, sink) {
  const info = await inspectBackup(path);
  if (!info.encrypted) return pipeline(createReadStream(path), sink);
  if (!key) throw new BackupError('La copia está cifrada y falta BACKUP_ENCRYPTION_KEY.');
  const expected = keyFingerprint(key);
  if (!info.fingerprint.equals(expected)) {
    throw new BackupError(
      `Esta copia se cifró con otra clave (huella ${info.fingerprint.toString('hex')}); la de BACKUP_ENCRYPTION_KEY es ` +
        `${expected.toString('hex')}. Usa la clave de entonces.`,
    );
  }
  const decipher = createDecipheriv('aes-256-gcm', key, info.iv);
  decipher.setAAD(info.aad);
  decipher.setAuthTag(info.tag);
  const end = info.size - TAG_BYTES - 1;
  const source = end >= HEADER_BYTES ? createReadStream(path, { start: HEADER_BYTES, end }) : Readable.from([]);
  try {
    await pipeline(source, decipher, sink);
  } catch (error) {
    if (/authenticate/i.test(String(error?.message))) throw new BackupError(`${path} está dañada o alterada: no pasa la comprobación de integridad.`);
    throw error;
  }
}

/** Comprueba la copia entera sin escribirla: integridad (si está cifrada) y que dentro hay un volcado de pg_dump. */
export async function verifyBackup(path, key) {
  const info = await inspectBackup(path);
  let bytes = 0;
  let start = Buffer.alloc(0);
  await readBackupInto(
    path,
    key,
    new Writable({
      write(chunk, _encoding, done) {
        if (start.length < PGDUMP_MAGIC.length) start = Buffer.concat([start, chunk.subarray(0, PGDUMP_MAGIC.length - start.length)]);
        bytes += chunk.length;
        done();
      },
    }),
  );
  if (start.toString('latin1') !== PGDUMP_MAGIC) throw new BackupError(`${path} no contiene un volcado de pg_dump.`);
  return { encrypted: info.encrypted, bytes, fingerprint: info.encrypted ? info.fingerprint.toString('hex') : null };
}
