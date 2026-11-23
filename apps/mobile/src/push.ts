import { PUSH_CHANNEL_ID, pushScreen, type PushScreen, type PushTokenDto } from '@appinity/shared';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { apiRequest } from './api/client';

/**
 * Notificaciones push en la app (fase B6). El servidor ya envía el resumen con el servicio de Expo (fase 12C); aquí
 * se crea el canal de Android, se pide el permiso, se registra el token del dispositivo en la API y se abre la
 * pantalla al tocar la notificación.
 *
 * Nada de esto puede romper la app. No hay push en la web, ni en Expo Go para Android (lo quitaron en el SDK 53), ni en
 * una build sin proyecto de EAS (sin él no hay token de Expo). En esos casos `expo-notifications` ni siquiera se carga
 * (en Expo Go avisaría al importarlo) y Ajustes explica por qué no llegan.
 */

type NotificationsModule = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;

export type PushSupport = 'available' | 'web' | 'expo-go' | 'no-project';

export type PushState =
  { kind: 'unsupported'; reason: Exclude<PushSupport, 'available'> } | { kind: 'off'; canAsk: boolean } | { kind: 'on' } | { kind: 'error'; message: string };

/** Id del proyecto de EAS de esta build (app.config.ts lo toma de EAS_PROJECT_ID o de `eas init`). */
export function easProjectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId;
  const id = fromConfig ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export function pushSupport(): PushSupport {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'web';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'expo-go';
  return easProjectId() ? 'available' : 'no-project';
}

let loaded: Promise<NotificationsModule | null> | undefined;

function notifications(): Promise<NotificationsModule | null> {
  loaded ??= pushSupport() === 'available' ? import('expo-notifications').catch(() => null) : Promise.resolve(null);
  return loaded;
}

/** Un fallo que no puede bloquear a la persona (cerrar sesión, arrancar): como mucho `ms` y nunca lanza. */
function bounded<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise.catch(() => undefined), new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * Al arrancar la app (una vez): cómo se muestran las notificaciones con la app abierta, el canal de Android y qué pasa
 * al tocar una (también si la app estaba cerrada). Devuelve la función que retira el listener.
 */
export async function setupNotifications(options: { channelName: string; open: (screen: PushScreen) => void }): Promise<() => void> {
  const Notifications = await notifications();
  if (!Notifications) return () => undefined;
  // Con la app abierta el resumen va a la lista de notificaciones, sin sonido ni banner: la persona ya está dentro.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  // En Android 13+ el canal tiene que existir antes de pedir el permiso; sin él, el sistema no muestra el diálogo.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: options.channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined);
  }
  const handle = (response: NotificationResponse) => {
    const screen = pushScreen(response.notification.request.content.data);
    if (screen) options.open(screen);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  const last = await Notifications.getLastNotificationResponseAsync().catch(() => null);
  if (last) {
    handle(last);
    await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }
  return () => subscription.remove();
}

let registered: string | null = null;

async function register(Notifications: NotificationsModule): Promise<PushState> {
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() });
    const body: PushTokenDto = { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
    await apiRequest<void>('/v1/me/push-tokens', { method: 'POST', body });
    registered = token;
    return { kind: 'on' };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Estado en este teléfono. Con permiso, registra el token (idempotente: Expo recomienda hacerlo en cada arranque para
 * que el token siga apuntando al dispositivo). Con `ask` y el permiso sin decidir, muestra el diálogo del sistema; si
 * la persona ya lo denegó, no se vuelve a preguntar (Ajustes ofrece abrir los del teléfono).
 */
export async function syncPush(options: { ask: boolean }): Promise<PushState> {
  const support = pushSupport();
  if (support !== 'available') return { kind: 'unsupported', reason: support };
  const Notifications = await notifications();
  if (!Notifications) return { kind: 'error', message: 'expo-notifications no está disponible en esta build' };
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && options.ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return { kind: 'off', canAsk: permission.canAskAgain };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  return register(Notifications);
}

/** Ajustes del sistema para esta app (cuando el permiso se denegó y ya no se puede volver a pedir). */
export function openSystemSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

/**
 * Al cerrar sesión o cambiar de cuenta: la API deja de enviar a este teléfono. Hay que llamarlo con la sesión aún
 * abierta. Si falla (sin red), no bloquea: al entrar otra cuenta, el token pasa a ella.
 */
export async function forgetPushToken(): Promise<void> {
  const Notifications = await notifications();
  if (!Notifications) return;
  const token =
    registered ??
    (await bounded(
      Notifications.getPermissionsAsync().then(async (p) =>
        p.granted ? (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() })).data : null,
      ),
      3_000,
    ));
  if (!token) return;
  await bounded(apiRequest<void>('/v1/me/push-tokens', { method: 'DELETE', body: { token } }), 3_000);
  registered = null;
}
