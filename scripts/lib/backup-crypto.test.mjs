import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { BackupError, encryptTransform, HEADER_BYTES, parseBackupKey, readBackupInto, verifyBackup } from './backup-crypto.mjs';

const dir = mkdtempSync(join(tmpdir(), 'appinity-backup-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const key = randomBytes(32);
const otherKey = randomBytes(32);
/** Un «volcado» sintético: empieza como los de pg_dump y ocupa varios trozos de stream. */
const dump = Buffer.concat([Buffer.from('PGDMP'), randomBytes(300_000)]);

async function encrypt(name, data = dump, withKey = key) {
  const path = join(dir, name);
  const chunks = [];
  await pipeline(
    Readable.from([data.subarray(0, 1000), data.subarray(1000, 70_000), data.subarray(70_000)]),
    encryptTransform(withKey),
    new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk);
        done();
      },
    }),
  );
  writeFileSync(path, Buffer.concat(chunks));
  return path;
}

async function decrypt(path, withKey = key) {
  const chunks = [];
  await readBackupInto(
    path,
    withKey,
    new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk);
        done();
      },
    }),
  );
  return Buffer.concat(chunks);
}

describe('copias cifradas (B9)', () => {
  it('cifra y descifra sin perder un byte, y el fichero no contiene el volcado en claro', async () => {
    const path = await encrypt('ok.dump.enc');
    const raw = readFileSync(path);
    expect(raw.subarray(0, 8).toString()).toBe('APPBAK01');
    expect(raw.length).toBe(HEADER_BYTES + dump.length + 16);
    expect(raw.includes(dump.subarray(5, 64))).toBe(false);
    expect((await decrypt(path)).equals(dump)).toBe(true);
    await expect(verifyBackup(path, key)).resolves.toMatchObject({ encrypted: true, bytes: dump.length });
  });

  it('dos copias del mismo volcado no se parecen (IV aleatorio)', async () => {
    const a = readFileSync(await encrypt('a.dump.enc'));
    const b = readFileSync(await encrypt('b.dump.enc'));
    expect(a.subarray(HEADER_BYTES, HEADER_BYTES + 64).equals(b.subarray(HEADER_BYTES, HEADER_BYTES + 64))).toBe(false);
  });

  it('una copia alterada (datos, cabecera o etiqueta) o cortada no pasa la comprobación', async () => {
    const original = readFileSync(await encrypt('base.dump.enc'));
    const cases = {
      datos: (b) => (b[HEADER_BYTES + 150_000] ^= 1),
      huella: (b) => (b[10] ^= 1),
      iv: (b) => (b[20] ^= 1),
      etiqueta: (b) => (b[b.length - 1] ^= 1),
    };
    for (const [name, tamper] of Object.entries(cases)) {
      const copy = Buffer.from(original);
      tamper(copy);
      const path = join(dir, `tampered-${name}.dump.enc`);
      writeFileSync(path, copy);
      await expect(verifyBackup(path, key), name).rejects.toBeInstanceOf(BackupError);
    }
    const cut = join(dir, 'cut.dump.enc');
    writeFileSync(cut, original.subarray(0, original.length - 1000));
    await expect(verifyBackup(cut, key)).rejects.toBeInstanceOf(BackupError);
  });

  it('con otra clave lo dice y no descifra nada', async () => {
    const path = await encrypt('other.dump.enc', dump, otherKey);
    await expect(verifyBackup(path, key)).rejects.toThrow(/otra clave/);
    await expect(verifyBackup(path, null)).rejects.toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it('acepta las copias antiguas sin cifrar y rechaza lo que no es una copia', async () => {
    const plain = join(dir, 'old.dump');
    writeFileSync(plain, dump);
    await expect(verifyBackup(plain, null)).resolves.toMatchObject({ encrypted: false, bytes: dump.length });
    const junk = join(dir, 'junk.dump.enc');
    writeFileSync(junk, randomBytes(500));
    await expect(verifyBackup(junk, key)).rejects.toThrow(/no es una copia/);
    const notDump = await encrypt('not-dump.dump.enc', randomBytes(1000));
    await expect(verifyBackup(notDump, key)).rejects.toThrow(/pg_dump/);
  });

  it('la clave tiene que ser 32 bytes en base64', () => {
    expect(parseBackupKey(` ${key.toString('base64')}\n`).equals(key)).toBe(true);
    expect(() => parseBackupKey('')).toThrow(/pnpm setup/);
    expect(() => parseBackupKey(undefined)).toThrow(/Falta/);
    expect(() => parseBackupKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => parseBackupKey('x'.repeat(44))).toThrow(/32 bytes/);
  });
});
