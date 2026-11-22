import type { Database } from '@appinity/database';
import type { AffinityJob } from '@appinity/shared';
import { recomputeAffinities, type AffinityRecomputeResult } from './affinities.js';
import { enqueueAffinityRefresh, type ProducerQueues } from './queues.js';

export interface AffinityJobOutcome {
  results: AffinityRecomputeResult[];
  /**
   * Tras un recálculo parcial, el completo agrupado: `scheduled` si quedó en cola (o ya lo estaba), `failed` si Redis
   * no respondió (lo cubre el recálculo diario) y `null` en un recálculo completo.
   */
  refresh: 'scheduled' | 'failed' | null;
  refreshError?: Error;
}

/**
 * Un trabajo de la cola de afinidades (worker). Con `userId`, recalcula las parejas de esa persona y pide el completo
 * agrupado: sus cambios mueven la rareza de las obras, y con ella los pesos de parejas en las que no está (fase B7).
 * Un fallo al encolarlo no hace fallar el trabajo: el parcial ya está guardado.
 */
export async function runAffinityJob(
  db: Database,
  queues: Pick<ProducerQueues, 'affinity'>,
  job: AffinityJob,
  options: { now?: Date } = {},
): Promise<AffinityJobOutcome> {
  if (!job.userId) return { results: await recomputeAffinities(db, { now: options.now }), refresh: null };
  const results = await recomputeAffinities(db, { userIds: [job.userId], now: options.now });
  try {
    await enqueueAffinityRefresh(queues);
    return { results, refresh: 'scheduled' };
  } catch (error) {
    return { results, refresh: 'failed', refreshError: error as Error };
  }
}
