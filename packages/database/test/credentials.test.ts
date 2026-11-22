import { describe, expect, it } from 'vitest';
import { decryptCredentials, encryptCredentials } from '../src/credentials.js';

const KEY = Buffer.alloc(32, 9).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 1).toString('base64');

describe('cifrado de credenciales', () => {
  it('cifra y descifra con la misma clave y la misma conexión', () => {
    const secret = { apiKey: 'k-123', refreshToken: 'r-456' };
    const ciphertext = encryptCredentials(secret, KEY, 'connection-1');
    expect(ciphertext).not.toContain('k-123');
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(decryptCredentials(ciphertext, KEY, 'connection-1')).toEqual(secret);
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(encryptCredentials({ a: 'b' }, KEY, 'c')).not.toBe(encryptCredentials({ a: 'b' }, KEY, 'c'));
  });

  it('falla con otra clave, otra conexión o datos alterados', () => {
    const ciphertext = encryptCredentials({ token: 'x' }, KEY, 'connection-1');
    expect(() => decryptCredentials(ciphertext, OTHER_KEY, 'connection-1')).toThrow();
    expect(() => decryptCredentials(ciphertext, KEY, 'connection-2')).toThrow();
    const parts = ciphertext.split('.');
    const tampered = [...parts.slice(0, 3), parts[3]!.slice(0, -2) + (parts[3]!.endsWith('AA') ? 'BB' : 'AA')].join('.');
    expect(() => decryptCredentials(tampered, KEY, 'connection-1')).toThrow();
  });

  it('rechaza claves de longitud incorrecta', () => {
    expect(() => encryptCredentials({ a: 'b' }, Buffer.alloc(16).toString('base64'), 'c')).toThrow(/32 bytes/);
  });
});
