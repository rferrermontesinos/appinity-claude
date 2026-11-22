import { APP_ERROR_REPORTS_PER_SESSION, type AppErrorReportDto } from '@appinity/shared';
import { APP_PLATFORM, APP_VERSION } from './app-info';
import { API } from './config';

/**
 * Avisos de errores de la app (fase B4). La app no lleva el SDK de Sentry: envía el error a la API, que lo filtra y lo
 * reenvía (si tiene SENTRY_DSN; si no, lo descarta). Solo sale lo técnico: tipo, mensaje, pila, la pantalla como patrón
 * de expo-router («person/[id]»), la plataforma y la versión. Nunca la sesión ni lo que la persona estaba viendo.
 * En desarrollo no se envía nada: la pantalla roja ya lo enseña.
 */

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

const sent = new Set<string>();
let currentScreen: string | undefined;
let installed = false;

/** Pantalla actual como patrón de ruta (los segmentos de expo-router: «(tabs)/people», «person/[id]»…). */
export function setCurrentScreen(segments: readonly string[]): void {
  currentScreen = segments.length ? segments.join('/').slice(0, 120) : 'index';
}

/** Envía un error una sola vez y como mucho APP_ERROR_REPORTS_PER_SESSION por sesión. Nunca lanza. */
export function reportAppError(error: unknown, fatal: boolean): Promise<void> {
  const os = APP_PLATFORM;
  if (__DEV__ || !os) return Promise.resolve();
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Error sin mensaje');
  const message = (err.message || 'Error sin mensaje').slice(0, 1_000);
  const key = `${err.name}:${message}`;
  if (sent.has(key) || sent.size >= APP_ERROR_REPORTS_PER_SESSION) return Promise.resolve();
  sent.add(key);
  const report: AppErrorReportDto = {
    name: err.name.slice(0, 100),
    message,
    ...(err.stack ? { stack: err.stack.slice(0, 8_000) } : {}),
    fatal,
    ...(currentScreen && /^[\w\-/[\]().]{1,120}$/.test(currentScreen) ? { screen: currentScreen } : {}),
    platform: os,
    appVersion: APP_VERSION,
  };
  return fetch(`${API.url}/v1/diagnostics/app-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  }).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Manejador global de React Native: avisa del error y después llama al de siempre. Si el error cierra la app, espera al
 * envío (2 s como mucho) antes de dejar que se cierre.
 */
export function installGlobalErrorReporting(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const sending = reportAppError(error, Boolean(isFatal));
    if (!isFatal) {
      previous(error, isFatal);
      return;
    }
    void Promise.race([sending, new Promise<void>((resolve) => setTimeout(resolve, 2_000))]).finally(() => previous(error, isFatal));
  });
}
