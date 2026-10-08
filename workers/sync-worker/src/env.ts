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
    catalogUserAgent:
      process.env.CATALOG_USER_AGENT?.trim() || 'APPINITY-Claude/0.1 (desarrollo; https://github.com/rferrermontesinos/appinity-claude)',
  };
}
