import { describe, expect, it, vi } from 'vitest';
import { createErrorReporter, installProcessHandlers, isSentryDsn } from '../src/index.js';

/** DSN SINTÉTICO: el envío va a un fetch simulado, nunca a la red. */
const DSN = 'https://clavepublica0123@o0.ingest.de.sentry.io/4500000000000001';

interface SentEnvelope {
  url: string;
  event: Record<string, unknown> & { tags?: Record<string, unknown> };
}

function fakeFetch() {
  const sent: SentEnvelope[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const lines = String(init?.body).split('\n');
    const itemHeader = JSON.parse(lines[1]!) as { type: string };
    if (itemHeader.type === 'event') sent.push({ url: String(url), event: JSON.parse(lines[2]!) as SentEnvelope['event'] });
    return new Response(null, { status: 200 });
  });
  return { sent, impl: impl as unknown as typeof fetch };
}

describe('avisos de errores a Sentry', () => {
  it('sin DSN están apagados: no envían nada ni instalan manejadores', async () => {
    const { impl } = fakeFetch();
    const reporter = createErrorReporter({ service: 'api', environment: 'test', release: 'appinity-api@0.1.0', fetchImpl: impl });
    expect(reporter.enabled).toBe(false);
    const listeners = process.listenerCount('uncaughtException');
    installProcessHandlers(reporter);
    expect(process.listenerCount('uncaughtException')).toBe(listeners);
    reporter.captureException(new Error('x'));
    reporter.captureAppError({ message: 'y', fatal: true, platform: 'android', appVersion: '0.1.0' });
    expect(await reporter.flush()).toBe(true);
    expect(impl).not.toHaveBeenCalled();
  });

  it('un DSN mal escrito es un error de configuración y no se imprime', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const dsn of ['no-es-un-dsn', 'https://o0.ingest.de.sentry.io/1', 'https://clave@o0.ingest.de.sentry.io/proyecto', 'ftp://clave@host/1']) {
        expect(() => createErrorReporter({ dsn, service: 'api', environment: 'test', release: 'r' })).toThrow(/DSN/);
      }
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
    expect(isSentryDsn(DSN)).toBe(true);
    expect(isSentryDsn('http://clave@127.0.0.1:9999/1')).toBe(true);
  });

  it('con DSN envían el error filtrado, con servicio, entorno y versión, y sin el nombre del equipo', async () => {
    const { sent, impl } = fakeFetch();
    const reporter = createErrorReporter({ dsn: DSN, service: 'api', environment: 'production', release: 'appinity-api@0.1.0', fetchImpl: impl });
    expect(reporter.enabled).toBe(true);
    reporter.captureException(new Error('No se pudo sincronizar a ana@example.com'), { tags: { route: 'POST /v1/me/connections/:id/sync' } });
    expect(await reporter.flush(2_000)).toBe(true);
    expect(sent).toHaveLength(1);
    const { url, event } = sent[0]!;
    expect(url).toMatch(/^https:\/\/o0\.ingest\.de\.sentry\.io\/api\/4500000000000001\/envelope\//);
    expect(event).toMatchObject({
      level: 'error',
      environment: 'production',
      release: 'appinity-api@0.1.0',
      server_name: 'appinity-api',
      platform: 'node',
      tags: { service: 'api', route: 'POST /v1/me/connections/:id/sync' },
    });
    expect(event.user).toBeUndefined();
    const text = JSON.stringify(event);
    expect(text).toContain('No se pudo sincronizar a [email]');
    expect(text).not.toContain('ana@example.com');
    // Las rutas de la pila son relativas: nada de /home/<usuario> ni C:\Users\<usuario>.
    expect(text).not.toMatch(/"(?:abs_path|filename)":"(?:\/home\/|[A-Z]:\\\\Users)/);
  });

  it('los errores de la app llegan con su pantalla, plataforma y versión, y la pila filtrada', async () => {
    const { sent, impl } = fakeFetch();
    const reporter = createErrorReporter({ dsn: DSN, service: 'api', environment: 'production', release: 'appinity-api@0.1.0', fetchImpl: impl });
    reporter.captureAppError({
      name: 'TypeError',
      message: "Cannot read property 'title' of undefined",
      stack: 'TypeError: x\n    at render (address at index.android.bundle:1:2345)\n    at u 3f2b8c1e-9a7d-4e6f-8b5a-1c2d3e4f5a6b',
      fatal: true,
      screen: 'person/[id]',
      platform: 'android',
      appVersion: '0.1.0',
    });
    await reporter.flush(2_000);
    expect(sent).toHaveLength(1);
    const { event } = sent[0]!;
    expect(event).toMatchObject({
      level: 'fatal',
      release: 'appinity-app@0.1.0',
      tags: { service: 'app', platform: 'android', app_version: '0.1.0', screen: 'person/[id]' },
    });
    expect(JSON.stringify(event)).toContain('index.android.bundle:1:2345');
    expect(JSON.stringify(event)).not.toContain('3f2b8c1e');
  });
});
