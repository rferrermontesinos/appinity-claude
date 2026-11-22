import { QUEUES, type AffinityJob, type CatalogImageJob, type ExpandCatalogJob, type ProfileSyncJob } from '@appinity/shared';
import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

/** Reintentos con backoff exponencial y retención acotada de trabajos terminados. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
};

export interface ProducerQueues {
  profileSync: Queue<ProfileSyncJob>;
  catalogImages: Queue<CatalogImageJob>;
  affinity: Queue<AffinityJob>;
  /** Trabajos de sistema pedidos desde la API (p. ej., ampliar el catálogo). */
  system: Queue<ExpandCatalogJob>;
  connection: Redis;
  close(): Promise<void>;
}

/** Colas del lado productor (API, seed). Falla rápido si Redis no responde. */
export function createProducerQueues(redisUrl: string, prefix: string): ProducerQueues {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  const profileSync = new Queue<ProfileSyncJob>(QUEUES.profileSync, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  const catalogImages = new Queue<CatalogImageJob>(QUEUES.catalogImages, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  const affinity = new Queue<AffinityJob>(QUEUES.affinity, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  const system = new Queue<ExpandCatalogJob>(QUEUES.system, { connection, prefix, defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 2 } });
  return {
    profileSync,
    catalogImages,
    affinity,
    system,
    connection,
    async close() {
      await Promise.allSettled([profileSync.close(), catalogImages.close(), affinity.close(), system.close()]);
      await connection.quit().catch(() => undefined);
    },
  };
}

/** El id del trabajo es el de la ejecución: reencolar la misma ejecución no la duplica. */
export function enqueueSync(queues: ProducerQueues, job: ProfileSyncJob) {
  return queues.profileSync.add('sync', job, { jobId: job.runId });
}

/** Espera del recálculo de un usuario: agrupa los votos y syncs de unos segundos en un solo trabajo. */
export const AFFINITY_USER_DELAY_MS = 10_000;
/**
 * Espera del recálculo completo que sigue a los parciales (fase B7). La rareza de `affinity-v5` depende de todo el
 * dataset: cuando alguien cambia sus gustos, cambian un poco los pesos de las parejas en las que no está. Como mucho
 * una vez cada 10 minutos mientras haya cambios; el recálculo diario queda de red de seguridad.
 */
export const AFFINITY_REFRESH_DELAY_MS = 10 * 60_000;

/**
 * Recálculo de afinidades de un usuario. Se agrupan los cambios cercanos: mientras el trabajo espera, otro voto o sync
 * del mismo usuario no encola otro. Si llega mientras el trabajo se ejecuta (y quizá ya leyó los gustos), se guarda y
 * se encola al terminar (`keepLastIfActive`): ningún cambio se pierde. La deduplicación se libera al completarse o al
 * fallar del todo, así que un fallo no bloquea los recálculos siguientes (con un id de trabajo fijo, sí los bloqueaba
 * mientras el trabajo fallido siguiera guardado).
 */
export function enqueueAffinity(queues: Pick<ProducerQueues, 'affinity'>, userId: string) {
  return queues.affinity.add(
    'recompute',
    { userId },
    {
      deduplication: { id: `affinity-user-${userId}`, keepLastIfActive: true },
      delay: AFFINITY_USER_DELAY_MS,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    },
  );
}

/**
 * Recálculo completo agrupado, tras los parciales: todas las parejas vuelven a usar los mismos pesos de rareza. Uno
 * pendiente basta para todos los cambios que lleguen mientras espera; si llegan mientras se ejecuta, se encola otro al
 * terminar.
 */
export function enqueueAffinityRefresh(queues: Pick<ProducerQueues, 'affinity'>) {
  return queues.affinity.add(
    'recompute-all',
    {},
    {
      deduplication: { id: 'affinity-refresh', keepLastIfActive: true },
      delay: AFFINITY_REFRESH_DELAY_MS,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    },
  );
}

/** Una imagen pendiente no se encola dos veces; al completarse puede volver a encolarse. */
export function enqueueImage(queues: ProducerQueues, imageId: string) {
  return queues.catalogImages.add('cache', { imageId }, { jobId: `image-${imageId}`, removeOnComplete: true });
}
