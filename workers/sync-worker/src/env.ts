export interface WorkerEnv {
  nodeEnv: string;
  demoMode: boolean;
  databaseUrl: string;
  redisUrl: string;
  queuePrefix: string;
  storageDir: string;
  steamApiKey?: string;
  /** TMDb: token de la aplicación (catálogo y listas con la sesión de cada usuario). */
  tmdbReadToken?: string;
  /** Descifra en memoria las credenciales por usuario (p. ej. la sesión de TMDb). */
  credentialsKey?: string;
  syncIntervalHours: number;
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
    ...(process.env.TMDB_API_READ_TOKEN?.trim() ? { tmdbReadToken: process.env.TMDB_API_READ_TOKEN.trim() } : {}),
    ...(process.env.CREDENTIALS_ENCRYPTION_KEY?.trim() ? { credentialsKey: process.env.CREDENTIALS_ENCRYPTION_KEY.trim() } : {}),
    syncIntervalHours: Number(process.env.SYNC_INTERVAL_HOURS ?? 24) || 24,
  };
}
