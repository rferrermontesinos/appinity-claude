import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sourceSyncRuns, userConnections, userItemObservations, type DatabaseHandle } from '@appinity/database';
import {
  connectSource,
  createSyncRun,
  disconnectSource,
  enqueueSync,
  NotFoundError,
  UnavailableError,
  type ProducerQueues,
  type SyncMode,
  type SyncTrigger,
} from '@appinity/ingestion';
import type { AdapterRegistry } from '@appinity/integrations';
import type { ConnectionDto, SyncRunDto } from '@appinity/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { ADAPTER_REGISTRY, DATABASE, QUEUES } from '../infra/tokens.js';

type RunRow = typeof sourceSyncRuns.$inferSelect;

export function toRunDto(run: RunRow): SyncRunDto {
  return {
    id: run.id,
    connectionId: run.connectionId,
    status: run.status,
    trigger: run.trigger,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    recordsReceived: run.recordsReceived,
    observationsInserted: run.observationsInserted,
    observationsUpdated: run.observationsUpdated,
    observationsUnchanged: run.observationsUnchanged,
    itemsCreated: run.itemsCreated,
    partialErrors: run.partialErrors,
    errorMessage: run.errorMessage,
  };
}

/** Conexiones del propio usuario. Toda consulta filtra por userId; un recurso ajeno responde 404. */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger('Connections');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(ADAPTER_REGISTRY) private readonly registry: AdapterRegistry,
    @Inject(QUEUES) private readonly queues: ProducerQueues,
  ) {}

  async list(userId: string): Promise<ConnectionDto[]> {
    const db = this.database.db;
    const rows = await db
      .select()
      .from(userConnections)
      .where(eq(userConnections.userId, userId))
      .orderBy(desc(userConnections.createdAt));
    const ids = rows.map((r) => r.id);
    const counts = ids.length
      ? await db
          .select({ connectionId: userItemObservations.connectionId, n: count() })
          .from(userItemObservations)
          .where(inArray(userItemObservations.connectionId, ids))
          .groupBy(userItemObservations.connectionId)
      : [];
    const countBy = new Map(counts.map((c) => [c.connectionId, c.n]));
    // Una fila por fuente: la conexión abierta o, si no hay, la revocada más reciente.
    const seen = new Set<string>();
    const visible = rows
      .sort((a, b) => Number(a.status === 'revoked') - Number(b.status === 'revoked'))
      .filter((r) => (seen.has(r.sourceKey) ? false : (seen.add(r.sourceKey), true)));
    return visible.map((r) => ({
      id: r.id,
      sourceKey: r.sourceKey,
      sourceName: this.registry.get(r.sourceKey)?.manifest.name ?? r.sourceKey,
      simulated: this.registry.get(r.sourceKey)?.manifest.simulated ?? false,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: (r.lastSyncStatus as ConnectionDto['lastSyncStatus']) ?? null,
      lastError: r.lastError,
      observationCount: countBy.get(r.id) ?? 0,
    }));
  }

  async connect(userId: string, sourceKey: string): Promise<{ connection: ConnectionDto; run: SyncRunDto }> {
    const connection = await connectSource(this.database.db, this.registry, userId, sourceKey);
    const run = await this.startSync(userId, connection.id, 'connect', 'full');
    const dto = (await this.list(userId)).find((c) => c.id === connection.id)!;
    return { connection: dto, run };
  }

  private async ownConnection(userId: string, connectionId: string) {
    const [row] = await this.database.db
      .select()
      .from(userConnections)
      .where(and(eq(userConnections.id, connectionId), eq(userConnections.userId, userId)));
    if (!row) throw new NotFoundError('Conexión no encontrada');
    return row;
  }

  async startSync(userId: string, connectionId: string, trigger: SyncTrigger, mode: SyncMode): Promise<SyncRunDto> {
    const connection = await this.ownConnection(userId, connectionId);
    if (connection.status === 'revoked') throw new UnavailableError('La conexión está revocada');
    const runId = await createSyncRun(this.database, connectionId, trigger, mode);
    try {
      await enqueueSync(this.queues, { connectionId, runId });
    } catch (error) {
      this.logger.error(`No se pudo encolar el sync ${runId}: ${(error as Error).message}`);
      await this.database.db
        .update(sourceSyncRuns)
        .set({ status: 'failed', finishedAt: new Date(), errorMessage: 'No se pudo encolar: Redis no disponible' })
        .where(eq(sourceSyncRuns.id, runId));
      throw new ServiceUnavailableException('No se pudo encolar el sync (Redis no disponible)');
    }
    const [run] = await this.database.db.select().from(sourceSyncRuns).where(eq(sourceSyncRuns.id, runId));
    return toRunDto(run!);
  }

  async runs(userId: string, connectionId: string): Promise<SyncRunDto[]> {
    await this.ownConnection(userId, connectionId);
    const rows = await this.database.db
      .select()
      .from(sourceSyncRuns)
      .where(eq(sourceSyncRuns.connectionId, connectionId))
      .orderBy(desc(sourceSyncRuns.queuedAt))
      .limit(20);
    return rows.map(toRunDto);
  }

  async disconnect(userId: string, connectionId: string, purge: boolean) {
    const pending = await this.database.db
      .select({ id: sourceSyncRuns.id })
      .from(sourceSyncRuns)
      .innerJoin(userConnections, eq(userConnections.id, sourceSyncRuns.connectionId))
      .where(
        and(
          eq(sourceSyncRuns.connectionId, connectionId),
          eq(userConnections.userId, userId),
          inArray(sourceSyncRuns.status, ['queued']),
        ),
      );
    const result = await disconnectSource(this.database.db, this.registry, userId, connectionId, { purge });
    // Detener los trabajos que aún esperan en la cola (los que ya corren se cancelan al comprobar el estado).
    await Promise.allSettled(pending.map((p) => this.queues.profileSync.remove(p.id)));
    return result;
  }
}
