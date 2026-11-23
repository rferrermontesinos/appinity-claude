import { isSentryDsn } from '@appinity/observability';
import { outboundUserAgent } from '@appinity/shared';

export interface WorkerEnv {
  nodeEnv: string;
  demoMode: boolean;
  databaseUrl: string;
  redisUrl: string;
  queuePrefix: string;
  storageDir: string;
  steamApiKey?: string;
  syncIntervalHours: number;
  /** Descifra en memoria las credenciales por usuario (p. ej. el refresh token de Google). */
  credentialsKey?: string;
  google?: { clientId: string; clientSecret: string; redirectUri: string };
  /** User-Agent identificable para Wikidata y OpenStreetMap (sus políticas lo exigen). */
  catalogUserAgent: string;
  /** Token de acceso de Expo (solo si se activa la seguridad reforzada de push en EAS). */
  expoAccessToken?: string;
  /** Geocodificador Nominatim (por defecto la instancia pública; en producción, una propia). */
  nominatimUrl?: string;
  /** Clave de TMDb (carteles de películas, solo uso no comercial). Sin ella, solo TVmaze para series. */
  tmdbApiKey?: string;
  /** Avisos de errores (fase B4): DSN de Sentry; sin él, apagados. */
  sentryDsn?: string;
  /** Entorno que ve Sentry (p. ej. «beta»). Por defecto, NODE_ENV. */
  sentryEnvironment: string;
}

/** Mismas reglas que la API: forma de DSN y https en producción. */
function sentryDsn(nodeEnv: string): string | undefined {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return undefined;
  if (!isSentryDsn(dsn)) throw new Error('SENTRY_DSN debe tener la forma https://<clave>@<host>/<id del proyecto>');
  if (nodeEnv === 'production' && !dsn.startsWith('https://')) throw new Error('SENTRY_DSN debe usar https con NODE_ENV=production');
  return dsn;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Ejecuta \`pnpm setup\` y revisa .env.`);
  return value;
}

export function loadWorkerEnv(): WorkerEnv {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const demoMode = process.env.DEMO_MODE === 'true';
  if (nodeEnv === 'production' && demoMode) throw new Error('DEMO_MODE está prohibido con NODE_ENV=production');
  const dsn = sentryDsn(nodeEnv);
  return {
    nodeEnv,
    demoMode,
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    queuePrefix: process.env.QUEUE_PREFIX ?? 'appinity-claude',
    storageDir: process.env.STORAGE_DIR ?? '.data/media',
    ...(process.env.STEAM_WEB_API_KEY?.trim() ? { steamApiKey: process.env.STEAM_WEB_API_KEY.trim() } : {}),
    syncIntervalHours: Number(process.env.SYNC_INTERVAL_HOURS ?? 24) || 24,
    ...(process.env.CREDENTIALS_ENCRYPTION_KEY?.trim() ? { credentialsKey: process.env.CREDENTIALS_ENCRYPTION_KEY.trim() } : {}),
    ...(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
      ? {
          google: {
            clientId: process.env.GOOGLE_OAUTH_CLIENT_ID.trim(),
            clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET.trim(),
            redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || 'http://localhost:3100/v1/connect/google_portability/callback',
          },
        }
      : {}),
    ...(process.env.NOMINATIM_URL?.trim() ? { nominatimUrl: process.env.NOMINATIM_URL.trim() } : {}),
    ...(process.env.EXPO_ACCESS_TOKEN?.trim() ? { expoAccessToken: process.env.EXPO_ACCESS_TOKEN.trim() } : {}),
    ...(process.env.TMDB_API_KEY?.trim() ? { tmdbApiKey: process.env.TMDB_API_KEY.trim() } : {}),
    ...(dsn ? { sentryDsn: dsn } : {}),
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT?.trim() || nodeEnv,
    // Sin «Claude» (Cloudflare lo bloquea como bot) y sin datos personales en producción (SEC-009).
    catalogUserAgent: process.env.CATALOG_USER_AGENT?.trim() || outboundUserAgent(process.env),
  };
}
