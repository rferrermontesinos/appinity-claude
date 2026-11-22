import type { Request } from 'express';
import type { AppEnv } from '../config/env.js';

const HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

/**
 * URL base pública para construir URLs de imágenes cacheadas y fallbacks. Si PUBLIC_API_URL no está definida,
 * se usa el Host con el que el teléfono llegó a la API (validado), de modo que la URL sea alcanzable desde él.
 */
export function publicBaseUrl(request: Request, env: AppEnv): string {
  if (env.PUBLIC_API_URL) return env.PUBLIC_API_URL.replace(/\/+$/, '');
  const host = request.headers.host ?? '';
  if (HOST_PATTERN.test(host)) return `${request.protocol}://${host}`;
  return `http://127.0.0.1:${env.API_PORT}`;
}
