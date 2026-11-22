import { sourceSyncRuns, userConnections, type DatabaseHandle } from '@appinity/database';
import type { AdapterRegistry } from '@appinity/integrations';
import { and, eq, inArray, isNull, lt, notExists, or } from 'drizzle-orm';
import { createSyncRun } from './sync-runner.js';

/**
 * Crea ejecuciones programadas para las conexiones de fuentes REALES con estrategia `scheduled`/`full-refresh` cuyo
 * último sync es más antiguo que el intervalo y que no tienen otro sync pendiente. Las fuentes simuladas no se
 * programan. Las conexiones en estado «error» esperan a que el usuario actúe.
 */
export async function scheduleDueSyncs(
  database: DatabaseHandle,
  registry: AdapterRegistry,
  options: { intervalHours: number; now?: Date },
): Promise<Array<{ connectionId: string; runId: string }>> {
  const keys = registry
    .adapters()
    .filter((a) => !a.manifest.simulated && (a.manifest.syncStrategy === 'scheduled' || a.manifest.syncStrategy === 'full-refresh'))
    .map((a) => a.manifest.key);
  if (!keys.length) return [];
  const threshold = new Date((options.now ?? new Date()).getTime() - options.intervalHours * 3_600_000);
  const db = database.db;
  const due = await db
    .select({ id: userConnections.id })
    .from(userConnections)
    .where(
      and(
        inArray(userConnections.sourceKey, keys),
        eq(userConnections.status, 'active'),
        or(isNull(userConnections.lastSyncAt), lt(userConnections.lastSyncAt, threshold)),
        notExists(
          db
            .select({ id: sourceSyncRuns.id })
            .from(sourceSyncRuns)
            .where(and(eq(sourceSyncRuns.connectionId, userConnections.id), inArray(sourceSyncRuns.status, ['queued', 'running']))),
        ),
      ),
    );
  const created: Array<{ connectionId: string; runId: string }> = [];
  for (const row of due) {
    created.push({ connectionId: row.id, runId: await createSyncRun(database, row.id, 'schedule', 'full') });
  }
  return created;
}
