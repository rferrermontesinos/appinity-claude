/** Nombres de colas BullMQ y contratos de sus trabajos (se serializan como JSON). */
export const QUEUES = {
  system: 'system',
  profileSync: 'profile-sync',
  catalogImages: 'catalog-images',
  affinity: 'affinity',
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

/** Recálculo de afinidades: de un usuario (tras un sync o una desconexión) o de todo (`userId` ausente). */
export interface AffinityJob {
  userId?: string;
}

/** Clave Redis del latido del worker (con prefijo de instalación). */
export function workerHeartbeatKey(prefix: string): string {
  return `${prefix}:worker:heartbeat`;
}
