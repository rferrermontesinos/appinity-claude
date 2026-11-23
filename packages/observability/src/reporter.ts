import { createStackParser, createTransport, dedupeIntegration, linkedErrorsIntegration, makeDsn, Scope, type Event, type SeverityLevel } from '@sentry/core';
import { ServerRuntimeClient, nodeStackLineParser } from '@sentry/core/server';
import { scrubEvent, scrubText } from './scrub.js';

/**
 * Avisos de errores a Sentry (fase B4) para la API y el worker. Sin `dsn` no hace nada (ni red ni manejadores): la beta
 * funciona igual sin cuenta de Sentry. Con `dsn`, cada evento pasa por `scrubEvent` y lleva solo:
 * - el error (tipo, mensaje filtrado y pila con rutas relativas);
 * - el servicio (`api`, `worker` o `app`), el entorno, la versión y unas etiquetas técnicas (ruta, cola, pantalla).
 * Nunca la persona, su IP, el nombre del equipo, la petición ni datos de los trabajos. Sin trazas de rendimiento.
 */
export type ServiceName = 'api' | 'worker';

export interface ErrorReporterOptions {
  /** DSN del proyecto de Sentry (región de la UE). Vacío: avisos apagados. */
  dsn?: string | undefined;
  service: ServiceName;
  environment: string;
  release: string;
  /** Para tests: sustituye a fetch en el envío. */
  fetchImpl?: typeof fetch;
}

export interface ErrorContext {
  /** Etiquetas técnicas sin datos personales (p. ej. la ruta con parámetros, la cola o el tipo de trabajo). */
  tags?: Record<string, string | number | boolean | undefined>;
  extra?: Record<string, unknown>;
  level?: SeverityLevel;
  /** false: el error no lo capturó el código (excepción no controlada). */
  handled?: boolean;
}

/** Error de la app móvil que llega a la API (POST /v1/diagnostics/app-errors). */
export interface AppErrorReport {
  name?: string | undefined;
  message: string;
  stack?: string | undefined;
  fatal: boolean;
  /** Patrón de la pantalla (p. ej. «person/[id]»), nunca la URL con identificadores. */
  screen?: string | undefined;
  platform: 'android' | 'ios' | 'web';
  appVersion: string;
}

export interface ErrorReporter {
  readonly enabled: boolean;
  captureException(error: unknown, context?: ErrorContext): void;
  captureAppError(report: AppErrorReport): void;
  /** Espera a que salgan los avisos pendientes (al apagar). */
  flush(timeoutMs?: number): Promise<boolean>;
}

/**
 * Forma de un DSN de Sentry: `https://<clave pública>@<host>[:puerto]/<id del proyecto>`. Se comprueba antes de dárselo al
 * SDK, que con un DSN mal escrito lo imprime entero en la consola.
 */
const DSN_SHAPE = /^https?:\/\/\w+@[\w.-]+(?::\d+)?\/(?:[\w.-]+\/)*\d+$/;

export function isSentryDsn(value: string): boolean {
  return DSN_SHAPE.test(value.trim());
}

const DISABLED: ErrorReporter = {
  enabled: false,
  captureException: () => undefined,
  captureAppError: () => undefined,
  flush: async () => true,
};

/** Sentry guarda las etiquetas como texto: se convierten aquí para que el valor sea el mismo en todos los eventos. */
function cleanTags(tags: ErrorContext['tags']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags ?? {})) if (value !== undefined) out[key] = String(value);
  return out;
}

export function createErrorReporter(options: ErrorReporterOptions): ErrorReporter {
  const dsn = options.dsn?.trim();
  if (!dsn) return DISABLED;
  if (!isSentryDsn(dsn) || !makeDsn(dsn)) throw new Error('SENTRY_DSN no es un DSN válido de Sentry');
  const fetchImpl = options.fetchImpl ?? fetch;

  const client = new ServerRuntimeClient({
    dsn,
    environment: options.environment,
    release: options.release,
    // Nunca el nombre real del equipo (en el PC del titular lleva su nombre).
    serverName: `appinity-${options.service}`,
    platform: 'node',
    runtime: { name: 'node', version: process.version },
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    // Solo errores: sin trazas ni spans.
    traceLifecycle: 'static',
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    stackParser: createStackParser(nodeStackLineParser()),
    transport: (transportOptions) =>
      createTransport(transportOptions, async (request) => {
        const response = await fetchImpl(transportOptions.url, {
          method: 'POST',
          body: request.body,
          headers: { 'Content-Type': 'application/x-sentry-envelope', ...transportOptions.headers },
          signal: AbortSignal.timeout(5_000),
        });
        return {
          statusCode: response.status,
          headers: { 'x-sentry-rate-limits': response.headers.get('x-sentry-rate-limits'), 'retry-after': response.headers.get('retry-after') },
        };
      }),
    beforeSend: (event) => scrubEvent(event),
  });
  client.init();

  const scopeFor = (tags: Record<string, string>, extra?: Record<string, unknown>, level?: SeverityLevel) => {
    const scope = new Scope();
    scope.setClient(client);
    scope.setTags({ service: options.service, ...tags });
    if (extra) scope.setExtras(extra);
    if (level) scope.setLevel(level);
    return scope;
  };

  return {
    enabled: true,
    captureException(error, context = {}) {
      client.captureException(
        error,
        { originalException: error, mechanism: { type: 'generic', handled: context.handled ?? true } },
        scopeFor(cleanTags(context.tags), context.extra, context.level),
      );
    },
    captureAppError(report) {
      const event: Event = {
        level: report.fatal ? 'fatal' : 'error',
        platform: 'javascript',
        release: `appinity-app@${report.appVersion}`,
        exception: {
          values: [{ type: report.name?.slice(0, 100) || 'Error', value: report.message, mechanism: { type: 'onerror', handled: !report.fatal } }],
        },
        // La pila de Hermes no se puede simbolizar sin los mapas de la build: se guarda como texto, filtrado.
        ...(report.stack ? { contexts: { app: { stack: scrubText(report.stack.slice(0, 4_000)) } } } : {}),
      };
      client.captureEvent(
        event,
        {},
        scopeFor({ service: 'app', platform: report.platform, app_version: report.appVersion, ...(report.screen ? { screen: report.screen } : {}) }),
      );
    },
    flush: async (timeoutMs = 2_000) => client.flush(timeoutMs),
  };
}

/**
 * Errores que nadie captura (excepción o promesa rechazada sin catch): se avisan y el proceso termina con código 1, como
 * haría Node sin manejadores. Solo se instalan con los avisos activos, para no cambiar nada sin DSN.
 */
export function installProcessHandlers(reporter: ErrorReporter, log: (message: string) => void = console.error): void {
  if (!reporter.enabled) return;
  const crash = (kind: string) => (error: unknown) => {
    log(`${kind}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    reporter.captureException(error, { level: 'fatal', handled: false, tags: { kind } });
    void reporter.flush(2_000).finally(() => process.exit(1));
  };
  process.on('uncaughtException', crash('uncaughtException'));
  process.on('unhandledRejection', crash('unhandledRejection'));
}
