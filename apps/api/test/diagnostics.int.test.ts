import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BadRequestException, Controller, Get, type INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NotFoundError } from '@appinity/ingestion';
import type { AppErrorReport, ErrorContext, ErrorReporter } from '@appinity/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { ApiExceptionsFilter } from '../dist/common/api-exceptions.filter.js';
import { loadEnv } from '../dist/config/env.js';
import { APP_ERRORS_PER_HOUR, DiagnosticsController } from '../dist/diagnostics/diagnostics.controller.js';
import { ERROR_REPORTER } from '../dist/infra/tokens.js';

/** Sentry SIMULADO: un servidor local que guarda los eventos que recibe. Ningún test sale a la red. */
interface ReceivedEvent {
  url: string;
  event: Record<string, unknown> & { tags?: Record<string, unknown> };
}

async function fakeSentry(): Promise<{ server: Server; dsn: string; received: ReceivedEvent[] }> {
  const received: ReceivedEvent[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => {
      const lines = body.split('\n');
      const item = JSON.parse(lines[1] ?? '{}') as { type?: string };
      if (item.type === 'event') received.push({ url: req.url ?? '', event: JSON.parse(lines[2] ?? '{}') as ReceivedEvent['event'] });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, dsn: `http://clavepublica0123@127.0.0.1:${port}/4500000000000002`, received };
}

async function start(env: Record<string, string>): Promise<{ app: INestApplication; base: string }> {
  const app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${port}` };
}

async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > until) throw new Error('Tiempo agotado esperando al Sentry simulado');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const APP_ERROR = {
  name: 'TypeError',
  message: "Cannot read property 'title' of undefined (ana@example.com)",
  stack: 'TypeError: x\n    at render (address at index.android.bundle:1:2345)\n    at /v1/people/3f2b8c1e-9a7d-4e6f-8b5a-1c2d3e4f5a6b',
  fatal: true,
  screen: '(tabs)/person/[id]',
  platform: 'android',
  appVersion: '0.1.0',
};

function postAppError(base: string, body: unknown) {
  return fetch(`${base}/v1/diagnostics/app-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

let sentry: Awaited<ReturnType<typeof fakeSentry>>;
let withDsn: { app: INestApplication; base: string };
let withoutDsn: { app: INestApplication; base: string };

beforeAll(async () => {
  sentry = await fakeSentry();
  withDsn = await start(testEnv({ SENTRY_DSN: sentry.dsn, SENTRY_ENVIRONMENT: 'beta' }));
  withoutDsn = await start(testEnv());
});

afterAll(async () => {
  await withDsn?.app.close();
  await withoutDsn?.app.close();
  await new Promise((resolve) => sentry?.server.close(resolve));
});

describe('avisos de errores de la app (POST /v1/diagnostics/app-errors)', () => {
  it('sin SENTRY_DSN responde 204 y no envía nada', async () => {
    const res = await postAppError(withoutDsn.base, APP_ERROR);
    expect(res.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sentry.received).toHaveLength(0);
  });

  it('con SENTRY_DSN reenvía el error filtrado, sin sesión, con pantalla, plataforma y versión', async () => {
    const res = await postAppError(withDsn.base, APP_ERROR);
    expect(res.status).toBe(204);
    await waitFor(() => sentry.received.length === 1);
    const { url, event } = sentry.received[0]!;
    expect(url).toMatch(/^\/api\/4500000000000002\/envelope\//);
    expect(event).toMatchObject({
      level: 'fatal',
      environment: 'beta',
      release: 'appinity-app@0.1.0',
      tags: { service: 'app', platform: 'android', app_version: '0.1.0', screen: '(tabs)/person/[id]' },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    const text = JSON.stringify(event);
    expect(text).toContain('index.android.bundle:1:2345');
    expect(text).not.toContain('ana@example.com');
    expect(text).not.toContain('3f2b8c1e');
    // La IP de quien envía el aviso nunca viaja.
    expect(text).not.toContain('127.0.0.1');
  });

  it('rechaza cuerpos que no son un error de la app (campos de más, plataforma o versión raras)', async () => {
    const before = sentry.received.length;
    for (const body of [
      { ...APP_ERROR, userId: 'u1' },
      { ...APP_ERROR, platform: 'windows' },
      { ...APP_ERROR, appVersion: 'latest' },
      { ...APP_ERROR, screen: 'person/3f2b8c1e 9a7d?x=1' },
      { ...APP_ERROR, message: '' },
    ]) {
      expect((await postAppError(withDsn.base, body)).status).toBe(400);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sentry.received).toHaveLength(before);
  });

  it('un 404 no se avisa', async () => {
    const before = sentry.received.length;
    expect((await fetch(`${withDsn.base}/v1/no-existe`)).status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sentry.received).toHaveLength(before);
  });

  it('la política de privacidad nombra a Sentry solo si los avisos están activos', async () => {
    const on = await (await fetch(`${withDsn.base}/legal/privacidad`)).text();
    const off = await (await fetch(`${withoutDsn.base}/legal/privacidad`)).text();
    expect(on).toContain('Sentry (avisos de errores)');
    expect(off).not.toContain('Sentry');
  });

  it(`reenvía como mucho ${APP_ERRORS_PER_HOUR} avisos de la app por hora y proceso`, () => {
    const forwarded: AppErrorReport[] = [];
    const reporter: ErrorReporter = {
      enabled: true,
      captureException: () => undefined,
      captureAppError: (report) => void forwarded.push(report),
      flush: async () => true,
    };
    const controller = new DiagnosticsController(reporter);
    for (let i = 0; i < APP_ERRORS_PER_HOUR + 5; i++) controller.appError({ ...APP_ERROR, platform: 'android', message: `error ${i}` });
    expect(forwarded).toHaveLength(APP_ERRORS_PER_HOUR);
  });
});

describe('configuración de los avisos', () => {
  it('valida el DSN y exige https en producción', () => {
    expect(() => loadEnv(testEnv({ SENTRY_DSN: 'no-es-un-dsn' }))).toThrow(/SENTRY_DSN/);
    expect(() => loadEnv(testEnv({ SENTRY_ENVIRONMENT: 'beta cerrada' }))).toThrow(/SENTRY_ENVIRONMENT/);
    const prod = {
      NODE_ENV: 'production',
      DEMO_MODE: 'false',
      DEV_AUTH_ENABLED: 'false',
      AUTH_SECRET: 'a'.repeat(48),
      PUBLIC_API_URL: 'https://api.example.org',
    };
    expect(() => loadEnv(testEnv({ ...prod, SENTRY_DSN: 'http://clave@o0.ingest.de.sentry.io/1' }))).toThrow(/https/);
    expect(loadEnv(testEnv({ ...prod, SENTRY_DSN: 'https://clave@o0.ingest.de.sentry.io/1' })).SENTRY_DSN).toBe('https://clave@o0.ingest.de.sentry.io/1');
    expect(loadEnv(testEnv({ SENTRY_DSN: '' })).SENTRY_DSN).toBeUndefined();
  });
});

/** Rutas de prueba que fallan a propósito (decoradores aplicados a mano: el test no pasa por el compilador de Nest). */
class FailingController {
  boom(): never {
    throw new Error('Fallo inesperado al leer el perfil de ana@example.com');
  }
  missing(): never {
    throw new NotFoundError('No existe');
  }
  unavailable(): never {
    throw new ServiceUnavailableException('Inicio de sesión con Google no configurado');
  }
  invalid(): never {
    throw new BadRequestException('Datos de entrada no válidos');
  }
}
Controller('test')(FailingController);
for (const [method, path] of [
  ['boom', 'boom/:id'],
  ['missing', 'missing'],
  ['unavailable', 'unavailable'],
  ['invalid', 'invalid'],
] as const) {
  Get(path)(FailingController.prototype, method, Object.getOwnPropertyDescriptor(FailingController.prototype, method)!);
}

describe('filtro de errores de la API', () => {
  const captured: { error: unknown; context: ErrorContext | undefined }[] = [];
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const reporter: ErrorReporter = {
      enabled: true,
      captureException: (error, context) => void captured.push({ error, context }),
      captureAppError: () => undefined,
      flush: async () => true,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [FailingController],
      providers: [
        { provide: ERROR_REPORTER, useValue: reporter },
        { provide: APP_FILTER, useClass: ApiExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('un error inesperado responde 500 genérico y se avisa con la ruta como patrón, sin la URL', async () => {
    const res = await fetch(`${base}/test/boom/3f2b8c1e-9a7d-4e6f-8b5a-1c2d3e4f5a6b?token=abc`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.context).toEqual({ tags: { route: 'GET /test/boom/:id', status: 500 } });
    expect(JSON.stringify(captured[0]!.context)).not.toContain('3f2b8c1e');
  });

  it('los errores de dominio conservan su respuesta y no se avisan', async () => {
    const res = await fetch(`${base}/test/missing`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ statusCode: 404, error: 'NOT_FOUND', message: 'No existe' });
  });

  it('no se avisan los 503 (no configurado o proveedor caído) ni los 4xx', async () => {
    const before = captured.length;
    expect((await fetch(`${base}/test/unavailable`)).status).toBe(503);
    expect((await fetch(`${base}/test/invalid`)).status).toBe(400);
    expect((await fetch(`${base}/test/no-existe`)).status).toBe(404);
    expect(captured).toHaveLength(before);
  });
});
