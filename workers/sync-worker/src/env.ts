export interface WorkerEnv {
  nodeEnv: string;
  demoMode: boolean;
  databaseUrl: string;
  redisUrl: string;
  queuePrefix: string;
  storageDir: string;
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
  };
}
