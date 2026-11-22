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

/** Perfiles de eas.json que llegan a otras personas (APK de la beta y Google Play). */
const RELEASE_PROFILES = new Set(['preview', 'production']);

/**
 * Fase B8: una build para otras personas nunca sale con la URL de ejemplo de eas.json («CAMBIAR-…»), sin https o sin URL
 * (la app buscaría la API en el PC de desarrollo y no funcionaría). EAS evalúa este fichero con el `env` del perfil;
 * `APPINITY_RELEASE_BUILD=1` aplica la misma comprobación a una build local.
 */
function assertReleaseApiUrl(): void {
  const profile = process.env.EAS_BUILD_PROFILE?.trim() ?? '';
  if (!RELEASE_PROFILES.has(profile) && process.env.APPINITY_RELEASE_BUILD !== '1') return;
  const url = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';
  const problem = !url
    ? 'falta'
    : /CAMBIAR/i.test(url)
      ? 'sigue siendo el ejemplo de eas.json'
      : !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url)
        ? 'tiene que ser https://dominio, sin ruta ni puerto'
        : null;
  if (problem) {
    const where = profile ? `el perfil «${profile}» de apps/mobile/eas.json` : 'EXPO_PUBLIC_API_URL';
    throw new Error(`La URL de la API ${problem} (${url || 'vacía'}). Pon la URL pública de la API (https://api.tu-dominio) en ${where}.`);
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertReleaseApiUrl();
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
