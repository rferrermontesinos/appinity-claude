import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuración dinámica sobre app.json (fase B6). Lo que depende de las cuentas del titular entra por variables de
 * entorno y nunca va en Git:
 * - EAS_PROJECT_ID: id del proyecto de EAS (`eas init`). Sin él, la app no pide token de push (lo dice en Ajustes).
 * - GOOGLE_SERVICES_JSON: ruta del google-services.json de Firebase (en EAS, una variable de tipo fichero). Si no está,
 *   se usa apps/mobile/google-services.json cuando existe (ignorado por Git). Sin él, Android no recibe push (FCM).
 * Sin ninguna de las dos, la app se compila y funciona igual que antes, sin notificaciones.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const eas = (config.extra?.eas ?? {}) as { projectId?: string };
  const projectId = process.env.EAS_PROJECT_ID?.trim() || eas.projectId;
  const localGoogleServices = existsSync(join(__dirname, 'google-services.json')) ? './google-services.json' : undefined;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() || localGoogleServices;
  return {
    ...config,
    name: config.name ?? 'APPINITY (Claude)',
    slug: config.slug ?? 'appinity-claude',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { ...eas, projectId } } : {}) },
  };
};
