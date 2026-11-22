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

/**
 * Recálculo de afinidades de un usuario. Se agrupan los cambios cercanos: mientras el trabajo espera (10 s), otro sync
 * del mismo usuario no encola otro (mismo id); al completarse se puede volver a encolar.
 */
export function enqueueAffinity(queues: Pick<ProducerQueues, 'affinity'>, userId: string) {
  return queues.affinity.add('recompute', { userId }, { jobId: `affinity-${userId}`, delay: 10_000, removeOnComplete: true, removeOnFail: { count: 100 } });
}

/** Una imagen pendiente no se encola dos veces; al completarse puede volver a encolarse. */
export function enqueueImage(queues: ProducerQueues, imageId: string) {
  return queues.catalogImages.add('cache', { imageId }, { jobId: `image-${imageId}`, removeOnComplete: true });
}
