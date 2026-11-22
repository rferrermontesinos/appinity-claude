import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Código de acceso de una cuenta local real (solo identidad de desarrollo). Se guarda con scrypt y sal; el código en
 * claro solo se muestra una vez en la terminal de quien lo crea.
 */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLocalCode(length = 12): string {
  const bytes = randomBytes(length);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashLocalCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(normalize(code), salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export function verifyLocalCode(code: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(normalize(code), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
