import Constants from 'expo-constants';

export type ApiUrlSource = 'env' | 'metro' | 'default';

const API_PORT = 3100;

/**
 * URL de la API vista desde el teléfono. En el móvil, "localhost" es el propio móvil, así que:
 * 1) EXPO_PUBLIC_API_URL (apps/mobile/.env, generado por `pnpm setup`);
 * 2) si falta, la IP del servidor Metro (la misma con la que el teléfono cargó la app) + puerto 3100;
 * 3) localhost solo como último recurso (útil en emulador iOS, no en un teléfono real).
 */
export function resolveApiBaseUrl(): { url: string; source: ApiUrlSource } {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return { url: fromEnv.replace(/\/+$/, ''), source: 'env' };
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return { url: `http://${host}:${API_PORT}`, source: 'metro' };
  return { url: `http://localhost:${API_PORT}`, source: 'default' };
}

export const API = resolveApiBaseUrl();
