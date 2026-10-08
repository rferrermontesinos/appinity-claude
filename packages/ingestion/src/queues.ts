import { QUEUES, type CatalogImageJob, type ProfileSyncJob } from '@appinity/shared';
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
  connection: Redis;
  close(): Promise<void>;
}

/** Colas del lado productor (API, seed). Falla rápido si Redis no responde. */
export function createProducerQueues(redisUrl: string, prefix: string): ProducerQueues {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  const profileSync = new Queue<ProfileSyncJob>(QUEUES.profileSync, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  const catalogImages = new Queue<CatalogImageJob>(QUEUES.catalogImages, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  return {
    profileSync,
    catalogImages,
    connection,
    async close() {
      await Promise.allSettled([profileSync.close(), catalogImages.close()]);
      await connection.quit().catch(() => undefined);
    },
  };
}

/** El id del trabajo es el de la ejecución: reencolar la misma ejecución no la duplica. */
export function enqueueSync(queues: ProducerQueues, job: ProfileSyncJob) {
  return queues.profileSync.add('sync', job, { jobId: job.runId });
}

/** Una imagen pendiente no se encola dos veces; al completarse puede volver a encolarse. */
export function enqueueImage(queues: ProducerQueues, imageId: string) {
  return queues.catalogImages.add('cache', { imageId }, { jobId: `image-${imageId}`, removeOnComplete: true });
}
