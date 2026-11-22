import { EntityResolver, LocalDiskStorage, WikidataSnapshotProvider, cacheCatalogImage } from '@appinity/catalog';
import { createDatabase } from '@appinity/database';
import { runConnectionSync } from '@appinity/ingestion';
import { createAdapterRegistry } from '@appinity/integrations';
import { QUEUES, workerHeartbeatKey, type CatalogImageJob, type PingJob, type ProfileSyncJob } from '@appinity/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './env.js';

const env = loadWorkerEnv();
// Los workers de BullMQ exigen maxRetriesPerRequest = null.
const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
const heartbeatClient = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 });
const database = createDatabase(env.databaseUrl, { max: 6, applicationName: 'appinity-claude-worker' });
const registry = createAdapterRegistry({ demoMode: env.demoMode });
const resolver = new EntityResolver(database.db, env.demoMode ? [new WikidataSnapshotProvider()] : []);
const storage = new LocalDiskStorage(env.storageDir);

const workers: Worker[] = [
  new Worker<PingJob, { pong: string }>(
    QUEUES.system,
    async (job) => ({ pong: `${job.data.requestedAt} → ${new Date().toISOString()}` }),
    { connection, prefix: env.queuePrefix, concurrency: 1 },
  ),
  // Syncs de fuentes de perfil. El bloqueo por conexión vive en PostgreSQL (runConnectionSync).
  new Worker<ProfileSyncJob>(
    QUEUES.profileSync,
    async (job) => {
      const outcome = await runConnectionSync({ database, registry, resolver }, job.data.runId);
      console.log(
        `[sync] ${job.data.connectionId} run ${job.data.runId}: ${outcome.status} ` +
          `(+${outcome.observationsInserted} ~${outcome.observationsUpdated} =${outcome.observationsUnchanged} -${outcome.observationsDeleted}, ` +
          `${outcome.partialErrors.length} errores parciales)`,
      );
      return { status: outcome.status };
    },
    { connection, prefix: env.queuePrefix, concurrency: 2 },
  ),
  // Caché de imágenes del catálogo, con ritmo limitado para no sobrecargar el origen (Wikimedia).
  new Worker<CatalogImageJob>(
    QUEUES.catalogImages,
    async (job) => ({ outcome: await cacheCatalogImage(database.db, storage, job.data.imageId) }),
    { connection, prefix: env.queuePrefix, concurrency: 2, limiter: { max: 4, duration: 1_000 } },
  ),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => console.error(`[${worker.name}] trabajo ${job?.id} falló: ${error.message}`));
}

async function beat(): Promise<void> {
  try {
    await heartbeatClient.set(workerHeartbeatKey(env.queuePrefix), String(Date.now()), 'EX', 60);
  } catch (error) {
    console.error(`No se pudo escribir el latido: ${(error as Error).message}`);
  }
}
await beat();
const heartbeat = setInterval(beat, 10_000);

console.log(
  `Worker escuchando colas [${workers.map((w) => w.name).join(', ')}] con prefijo ${env.queuePrefix}` +
    (env.demoMode ? ' · DEMO_MODE: fuentes fixture activas' : ''),
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: cerrando worker…`);
  clearInterval(heartbeat);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([connection.quit(), heartbeatClient.quit(), database.close()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
