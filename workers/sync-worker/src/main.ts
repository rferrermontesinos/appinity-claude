import { EntityResolver, LocalDiskStorage, WikidataSnapshotProvider, cacheCatalogImage } from '@appinity/catalog';
import { createDatabase } from '@appinity/database';
import { createProducerQueues, enqueueSync, runConnectionSync, scheduleDueSyncs } from '@appinity/ingestion';
import { createAdapterRegistry, createCatalogIdentifier } from '@appinity/integrations';
import {
  QUEUES,
  isSourceError,
  workerHeartbeatKey,
  type CatalogImageJob,
  type PingJob,
  type ProfileSyncJob,
} from '@appinity/shared';
import { DelayedError, Queue, UnrecoverableError, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './env.js';

const env = loadWorkerEnv();
// Los workers de BullMQ exigen maxRetriesPerRequest = null.
const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
const heartbeatClient = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 });
const database = createDatabase(env.databaseUrl, { max: 6, applicationName: 'appinity-claude-worker' });
const registry = createAdapterRegistry({
  demoMode: env.demoMode,
  ...(env.steamApiKey ? { steam: { apiKey: env.steamApiKey } } : {}),
  ...(env.google
    ? {
        google: {
          ...env.google,
          // Lugares con OpenStreetMap y obras con Wikidata (licencias de uso comercial).
          identifier: createCatalogIdentifier({ userAgent: env.catalogUserAgent }),
          // Estructura del export SIN datos personales: sirve para contrastar el formato real con el documentado.
          onArchiveSummary: (summary) => console.log(`[google] export ${summary.group}: ${JSON.stringify({ ...summary, group: undefined })}`),
        },
      }
    : {}),
});
const producer = createProducerQueues(env.redisUrl, env.queuePrefix);
const resolver = new EntityResolver(database.db, env.demoMode ? [new WikidataSnapshotProvider()] : []);
const storage = new LocalDiskStorage(env.storageDir);

const workers: Worker[] = [
  new Worker<PingJob, unknown>(
    QUEUES.system,
    async (job) => {
      // Programador: encola syncs periódicos de fuentes reales (sin depender de un botón «Importar»).
      if (job.name === 'schedule-syncs') {
        const due = await scheduleDueSyncs(database, registry, { intervalHours: env.syncIntervalHours });
        for (const item of due) await enqueueSync(producer, item);
        if (due.length) console.log(`[scheduler] ${due.length} sync(s) programado(s)`);
        return { scheduled: due.length };
      }
      return { pong: `${job.data.requestedAt} → ${new Date().toISOString()}` };
    },
    { connection, prefix: env.queuePrefix, concurrency: 1 },
  ),
  // Syncs de fuentes de perfil. El bloqueo por conexión vive en PostgreSQL (runConnectionSync).
  new Worker<ProfileSyncJob>(
    QUEUES.profileSync,
    async (job, token) => {
      let outcome;
      try {
        outcome = await runConnectionSync(
          { database, registry, resolver, ...(env.credentialsKey ? { credentialsKey: env.credentialsKey } : {}) },
          job.data.runId,
        );
      } catch (error) {
        // Perfil privado, clave no válida…: reintentar no sirve; el usuario debe actuar (mensaje en la app).
        if (isSourceError(error) && !error.retryable) throw new UnrecoverableError(error.message);
        throw error;
      }
      // El proveedor aún prepara los datos (export de Google): el mismo trabajo vuelve más tarde, sin gastar reintentos.
      if (outcome.status === 'deferred') {
        const delay = outcome.retryAfterMs ?? 60_000;
        console.log(`[sync] ${job.data.connectionId} run ${job.data.runId}: esperando al proveedor, nueva consulta en ${Math.round(delay / 1000)} s`);
        await job.moveToDelayed(Date.now() + delay, token);
        throw new DelayedError();
      }
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

// Revisión horaria de syncs pendientes (idempotente: el programador se registra con un id fijo).
const systemQueue = new Queue(QUEUES.system, { connection, prefix: env.queuePrefix });
await systemQueue.upsertJobScheduler('schedule-syncs', { every: 60 * 60 * 1000 }, { name: 'schedule-syncs', data: { requestedAt: 'scheduler' } });

console.log(
  `Worker escuchando colas [${workers.map((w) => w.name).join(', ')}] con prefijo ${env.queuePrefix}` +
    (env.demoMode ? ' · DEMO_MODE: fuentes fixture activas' : '') +
    (env.steamApiKey ? ` · Steam activo (syncs cada ${env.syncIntervalHours} h)` : ' · Steam sin configurar (falta STEAM_WEB_API_KEY)') +
    (env.google ? ' · Google activo' : ' · Google sin configurar (falta el cliente OAuth)') +
    (env.google && !env.credentialsKey ? ' · AVISO: falta CREDENTIALS_ENCRYPTION_KEY' : ''),
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: cerrando worker…`);
  clearInterval(heartbeat);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([systemQueue.close(), producer.close()]);
  await Promise.allSettled([connection.quit(), heartbeatClient.quit(), database.close()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
