import { z } from 'zod';

/**
 * Notificaciones push: el servidor envía el resumen (fase 12C) y la app lo recibe (fase B6). Este es el contrato entre
 * ambos: el canal de Android, las pantallas a las que puede llevar una notificación y el registro del dispositivo.
 */

/** Canal de Android de los resúmenes. El servidor lo pone en cada mensaje y la app lo crea con un nombre traducido. */
export const PUSH_CHANNEL_ID = 'default';

/** Pantallas a las que lleva tocar una notificación (`data.screen`). La app ignora cualquier otro valor. */
export const PUSH_SCREENS = ['home'] as const;
export type PushScreen = (typeof PUSH_SCREENS)[number];

/** Pantalla de una notificación tocada, o null si sus datos no traen una conocida. */
export function pushScreen(data: unknown): PushScreen | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const screen = (data as Record<string, unknown>).screen;
  return typeof screen === 'string' && (PUSH_SCREENS as readonly string[]).includes(screen) ? (screen as PushScreen) : null;
}

/** Token de Expo de un dispositivo (`ExponentPushToken[…]`). */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[\w-]{10,}\]$/;

/** Alta (o reactivación) del dispositivo: `POST /v1/me/push-tokens`. */
export const pushTokenSchema = z.strictObject({ token: z.string().min(10).max(200), platform: z.enum(['ios', 'android']) });
export type PushTokenDto = z.infer<typeof pushTokenSchema>;

/** Baja del dispositivo al cerrar sesión: `DELETE /v1/me/push-tokens`. */
export const pushTokenRemoveSchema = z.strictObject({ token: z.string().min(10).max(200) });
export type PushTokenRemoveDto = z.infer<typeof pushTokenRemoveSchema>;
