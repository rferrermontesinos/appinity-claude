/** Nombres de colas BullMQ y contratos de sus trabajos (se serializan como JSON). */
export const QUEUES = {
  system: 'system',
  profileSync: 'profile-sync',
  catalogImages: 'catalog-images',
} as const;

export interface PingJob {
  requestedAt: string;
}

export interface ProfileSyncJob {
  connectionId: string;
  runId: string;
}

export interface CatalogImageJob {
  imageId: string;
}

/** Clave Redis del latido del worker (con prefijo de instalación). */
export function workerHeartbeatKey(prefix: string): string {
  return `${prefix}:worker:heartbeat`;
}
