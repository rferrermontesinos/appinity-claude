import type { Event } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { relativeFilename, scrubEvent, scrubText, scrubValue } from '../src/index.js';

/** Valores SINTÉTICOS con la forma de los reales (ningún token ni dato es auténtico). */
describe('filtro de privacidad de los avisos de errores', () => {
  it('quita emails, tokens, JWT, tokens de push, IDs, IPs y secretos de cualquier texto', () => {
    const text = [
      'Fallo con ana.lopez+beta@gmail.com',
      'Authorization: Bearer abc.DEF-123_xyz',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJh',
      'google ya29.a0AfB_simulado-123 y 1//0gSimuladoRefreshToken-abcdefghij',
      'push ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      'usuario 3f2b8c1e-9a7d-4e6f-8b5a-1c2d3e4f5a6b',
      'steam 76561198000000000',
      'ip 203.0.113.7 y 2001:db8:85a3:0:0:8a2e:370:7334',
      'clave 0123456789ABCDEF0123456789ABCDEF',
      'secreto c2VjcmV0by1sYXJnby1zaW11bGFkby1kZS1wcnVlYmEtMDEyMzQ1Njc4OQ',
    ].join(' | ');
    const out = scrubText(text);
    for (const leaked of [
      'ana.lopez',
      'gmail',
      'abc.DEF',
      'eyJ',
      'ya29',
      '1//0g',
      'ExponentPushToken[',
      '3f2b8c1e',
      '7656119',
      '203.0.113.7',
      '2001:db8',
      '0123456789ABCDEF',
      'c2VjcmV0',
    ]) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('[email]');
    expect(out).toContain('Bearer [token]');
    expect(out).toContain('[jwt]');
    expect(out).toContain('[push-token]');
    expect(out).toContain('[id]');
    expect(out).toContain('[steam-id]');
    expect(out).toContain('[ip]');
  });

  it('borra los parámetros secretos de las URL y deja el resto', () => {
    expect(scrubText('GET https://api.example.org/v1/auth/google/callback?code=4/0Abc-secreto&state=xyz123&lang=es')).toBe(
      'GET https://api.example.org/v1/auth/google/callback?code=[redacted]&state=[redacted]&lang=es',
    );
  });

  it('quita los valores de las consultas y de lo que no se pudo leer (nombres, notas, mensajes)', () => {
    expect(scrubText('Failed query: insert into "chat_messages" ("id", "body") values ($1, $2)\nparams: 1,Hola Ana, ¿quedamos el sábado?')).toBe(
      'Failed query: insert into "chat_messages" ("id", "body") values ($1, $2)\nparams: [redacted]',
    );
    expect(scrubText('invalid input syntax for type integer: "Ricard"')).toBe('invalid input syntax for type integer: "[redacted]"');
    expect(scrubText('Unexpected token \'N\', "Nota de Ana: me encantó"... is not valid JSON')).toBe('Unexpected token \'N\', "[redacted]" is not valid JSON');
  });

  it('no confunde versiones ni rutas con datos personales', () => {
    expect(scrubText('zod@4.6.7 falló en /v1/people/:id con 500')).toBe('zod@4.6.7 falló en /v1/people/:id con 500');
  });

  it('quita la carpeta personal de las rutas (lleva el nombre de quien usa el PC)', () => {
    expect(scrubText("ENOENT: no such file 'C:\\Users\\Ricard\\appinity\\.env'")).toBe("ENOENT: no such file '~\\appinity\\.env'");
    expect(scrubText('/home/ana/appinity/apps/api/dist/main.js:10')).toBe('~/appinity/apps/api/dist/main.js:10');
  });

  it('rutas de la pila relativas al repositorio', () => {
    expect(relativeFilename('C:\\Users\\Ricard\\appinity-claude\\apps\\api\\dist\\main.js')).toBe('apps/api/dist/main.js');
    expect(relativeFilename('/srv/app/node_modules/.pnpm/x@1/node_modules/@nestjs/core/router/router-proxy.js')).toBe(
      'node_modules/@nestjs/core/router/router-proxy.js',
    );
    expect(relativeFilename('file:///home/ana/appinity-claude/workers/sync-worker/dist/main.js')).toBe('workers/sync-worker/dist/main.js');
    expect(relativeFilename('/opt/otra/cosa.js')).toBe('cosa.js');
    expect(relativeFilename('node:internal/process/task_queues')).toBe('node:internal/process/task_queues');
  });

  it('sustituye enteras las claves sensibles y limpia los valores anidados', () => {
    expect(
      scrubValue({ authorization: 'Bearer x', refreshToken: 'abc', userEmail: 'a@b.es', nested: { note: 'escribe a c@d.com', list: ['e@f.org'] }, count: 3 }),
    ).toEqual({
      authorization: '[redacted]',
      refreshToken: '[redacted]',
      userEmail: '[redacted]',
      nested: { note: 'escribe a [email]', list: ['[email]'] },
      count: 3,
    });
  });

  it('un evento sale sin persona, petición, migas, variables locales ni código fuente', () => {
    const event: Event = {
      message: 'error de x@y.com',
      user: { id: 'u1', email: 'x@y.com', ip_address: '203.0.113.7' },
      request: { url: 'https://api.example.org/v1/me?token=abc', headers: { authorization: 'Bearer abc', cookie: 'a=b' }, data: { body: 1 } },
      breadcrumbs: [{ message: 'navegó a /person/1' }],
      modules: { express: '5.0.0' },
      tags: { route: 'GET /v1/people/:id', email: 'x@y.com' },
      extra: { hint: 'ver 3f2b8c1e-9a7d-4e6f-8b5a-1c2d3e4f5a6b' },
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'No se pudo leer el perfil de x@y.com',
            stacktrace: {
              frames: [
                {
                  filename: 'C:\\Users\\Ricard\\appinity-claude\\apps\\api\\dist\\me\\me.service.js',
                  abs_path: 'C:\\Users\\Ricard\\appinity-claude\\apps\\api\\dist\\me\\me.service.js',
                  function: 'MeService.get',
                  lineno: 10,
                  vars: { token: 'secreto' },
                  context_line: 'const token = "secreto";',
                  pre_context: ['a'],
                  post_context: ['b'],
                },
              ],
            },
          },
        ],
      },
    };
    const clean = scrubEvent(event);
    expect(clean.user).toBeUndefined();
    expect(clean.request).toBeUndefined();
    expect(clean.breadcrumbs).toBeUndefined();
    expect(clean.modules).toBeUndefined();
    expect(clean.message).toBe('error de [email]');
    expect(clean.tags).toEqual({ route: 'GET /v1/people/:id', email: '[redacted]' });
    expect(clean.extra).toEqual({ hint: 'ver [id]' });
    const exception = clean.exception!.values![0]!;
    expect(exception.value).toBe('No se pudo leer el perfil de [email]');
    expect(exception.stacktrace!.frames![0]).toEqual({
      filename: 'apps/api/dist/me/me.service.js',
      abs_path: 'apps/api/dist/me/me.service.js',
      function: 'MeService.get',
      lineno: 10,
    });
    expect(JSON.stringify(clean)).not.toMatch(/Ricard|secreto|x@y\.com|203\.0\.113/);
    // El evento original no se modifica.
    expect(event.user).toBeDefined();
  });
});
