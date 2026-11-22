import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type ApiUrlSource = 'env' | 'metro' | 'web' | 'default';

const API_PORT = 3100;
/** IP de red local (la que el router asigna al PC y puede cambiar de un día para otro). */
const LAN_URL = /^http:\/\/(192\.168|10|172\.(1[6-9]|2\d|3[01]))\.[\d.]+(:\d+)?$/;

/**
 * URL de la API:
 * 1) en la vista web del PC (localhost), la API del mismo PC: http://localhost:3100;
 * 2) EXPO_PUBLIC_API_URL (apps/mobile/.env) si apunta a un servidor fijo (https o un nombre);
 * 3) la IP del servidor Metro (la misma con la que el teléfono cargó la app) + puerto 3100. Se prefiere a una IP local
 *    del .env porque el router puede cambiar la IP del PC y la del .env quedaría obsoleta;
 * 4) la IP local del .env, y localhost como último recurso (emulador iOS).
 */
export function resolveApiBaseUrl(): { url: string; source: ApiUrlSource } {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return { url: `http://localhost:${API_PORT}`, source: 'web' };
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (fromEnv && !LAN_URL.test(fromEnv)) return { url: fromEnv, source: 'env' };
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return { url: `http://${host}:${API_PORT}`, source: 'metro' };
  if (fromEnv) return { url: fromEnv, source: 'env' };
  return { url: `http://localhost:${API_PORT}`, source: 'default' };
}

export const API = resolveApiBaseUrl();
