import { describe, expect, it } from 'vitest';
import { devLoginState } from '../src/dev-login.js';

describe('pantalla de entrada: identidad de desarrollo (auditoría B10)', () => {
  it('un 404 de /v1/dev/users la oculta del todo: así la ve un tester por el túnel o en producción', () => {
    expect(devLoginState({ isSuccess: false, isError: true, errorStatus: 404 })).toBe('hidden');
  });

  it('se enseña cuando el servidor la ofrece, y mientras tanto solo se espera', () => {
    expect(devLoginState({ isSuccess: true, isError: false })).toBe('available');
    expect(devLoginState({ isSuccess: false, isError: false })).toBe('loading');
  });

  it('cualquier otro fallo se enseña: la API no responde o falla, y tampoco se podría entrar con Google', () => {
    expect(devLoginState({ isSuccess: false, isError: true })).toBe('error');
    for (const errorStatus of [0, 401, 429, 500, 503]) expect(devLoginState({ isSuccess: false, isError: true, errorStatus })).toBe('error');
  });
});
