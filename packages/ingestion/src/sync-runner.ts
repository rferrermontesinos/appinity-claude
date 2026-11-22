import { createHash } from 'node:crypto';
import type { EntityResolver, Tx } from '@appinity/catalog';
import {
  sourceSyncRuns,
  userConnections,
  userItemObservations,
  users,
  type DatabaseHandle,
} from '@appinity/database';
import type { AdapterRegistry } from '@appinity/integrations';
import {
  isSourceError,
  parseObservation,
  type NormalizedObservation,
  type ProfileSourceKey,
  type SyncCursor,
  type SyncPartialError,
} from '@appinity/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ConnectionRevokedError } from './errors.js';
import { recomputeProfiles } from './profiles.js';

export interface SyncDeps {
  database: DatabaseHandle;
  registry: AdapterRegistry;
  resolver: EntityResolver;
  pageSize?: number;
  now?: () => Date;
}

export type SyncTrigger = 'user' | 'seed' | 'schedule' | 'connect';
export type SyncMode = 'incremental' | 'full';

export interface SyncOutcome {
  runId: string;
  status: 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'skipped';
  recordsReceived: number;
  observationsInserted: number;
  observationsUpdated: number;
  observationsUnchanged: number;
  observationsDeleted: number;
  itemsCreated: number;
  partialErrors: SyncPartialError[];
  errorMessage?: string;
}

export async function createSyncRun(
  database: DatabaseHandle,
  connectionId: string,
  trigger: SyncTrigger,
  mode: SyncMode,
): Promise<string> {
  const [row] = await database.db
    .insert(sourceSyncRuns)
    .values({ connectionId, trigger, mode, status: 'queued' })
    .returning({ id: sourceSyncRuns.id });
  return row!.id;
}

/**
 * Huella del contenido evidencial: distingue "sin cambios" de "actualizado" al repetir un sync. Excluye el
 * método de resolución (`metadata.resolvedVia`), que cambia de forma natural cuando el objeto ya existe.
 */
export function observationHash(o: NormalizedObservation, catalogItemId: string): string {
  const { resolvedVia: _resolvedVia, ...metadata } = (o.metadata ?? {}) as Record<string, unknown>;
  const payload = JSON.stringify([
    catalogItemId,
    o.mapperVersion,
    o.knownConfidence,
    o.consumedConfidence,
    o.preferenceScore,
    o.preferenceConfidence,
    o.preferenceBasis,
    o.engagement ?? null,
    o.occurredAt ?? null,
    o.timestampPrecision ?? null,
    metadata,
  ]);
  return createHash('sha256').update(payload).digest('hex');
}

/** Comprueba dentro de la transacción que la conexión sigue activa; bloquea frente a una desconexión simultánea. */
async function assertActive(tx: Tx, connectionId: string): Promise<void> {
  const [row] = await tx
    .select({ status: userConnections.status })
    .from(userConnections)
    .where(eq(userConnections.id, connectionId))
    .for('share');
  if (!row || row.status === 'revoked') throw new ConnectionRevokedError('La conexión se ha revocado durante el sync');
}

type WriteResult = { kind: 'inserted' | 'updated' | 'unchanged'; previousItemId: string | null };

async function writeObservation(
  tx: Tx,
  o: NormalizedObservation,
  connectionId: string,
  catalogItemId: string,
): Promise<WriteResult> {
  const hash = observationHash(o, catalogItemId);
  const [existing] = await tx
    .select({ id: userItemObservations.id, itemId: userItemObservations.catalogItemId, hash: userItemObservations.contentHash })
    .from(userItemObservations)
    .where(
      and(
        eq(userItemObservations.connectionId, connectionId),
        eq(userItemObservations.sourceRecordId, o.sourceRecordId),
        eq(userItemObservations.observationKind, o.observationKind),
      ),
    );
  if (existing && existing.hash === hash) return { kind: 'unchanged', previousItemId: null };

  const values = {
    userId: o.userId,
    catalogItemId,
    connectionId,
    sourceKey: o.source,
    sourceRecordId: o.sourceRecordId,
    observationKind: o.observationKind,
    mapperVersion: o.mapperVersion,
    knownConfidence: o.knownConfidence,
    consumedConfidence: o.consumedConfidence,
    preferenceScore: o.preferenceScore,
    preferenceConfidence: o.preferenceConfidence,
    preferenceBasis: o.preferenceBasis,
    engagement: o.engagement ?? null,
    // La fecha de actividad es la de la fuente; la de sync nunca la sustituye.
    occurredAt: o.occurredAt ? new Date(o.occurredAt) : null,
    timestampPrecision: o.timestampPrecision ?? null,
    contentHash: hash,
    metadata: o.metadata ?? {},
  };
  if (existing) {
    await tx
      .update(userItemObservations)
      .set({ ...values, syncedAt: sql`now()` })
      .where(eq(userItemObservations.id, existing.id));
    return { kind: 'updated', previousItemId: existing.itemId };
  }
  await tx.insert(userItemObservations).values(values);
  return { kind: 'inserted', previousItemId: null };
}

/**
 * Ejecuta un sync (§14): pagina el adapter, valida en runtime cada observación, resuelve el objeto canónico,
 * escribe de forma idempotente y reconsolida los perfiles afectados. Un sync fallido no avanza el cursor ni
 * borra evidencia anterior; una conexión revocada a mitad no recibe más escrituras.
 */
export async function runConnectionSync(deps: SyncDeps, runId: string): Promise<SyncOutcome> {
  const { database, registry, resolver } = deps;
  const db = database.db;
  const now = deps.now ?? (() => new Date());
  const pageSize = deps.pageSize ?? 50;

  const [run] = await db.select().from(sourceSyncRuns).where(eq(sourceSyncRuns.id, runId));
  if (!run) throw new Error(`Ejecución de sync inexistente: ${runId}`);
  const outcome: SyncOutcome = {
    runId,
    status: 'skipped',
    recordsReceived: 0,
    observationsInserted: 0,
    observationsUpdated: 0,
    observationsUnchanged: 0,
    observationsDeleted: 0,
    itemsCreated: 0,
    partialErrors: [],
  };
  // Reintentos del mismo trabajo: solo se reanuda lo que no terminó.
  if (!['queued', 'running', 'failed'].includes(run.status)) return outcome;

  const [connection] = await db
    .select({ connection: userConnections, dataset: users.dataset })
    .from(userConnections)
    .innerJoin(users, eq(users.id, userConnections.userId))
    .where(eq(userConnections.id, run.connectionId));
  const finish = async (status: SyncOutcome['status'], errorMessage?: string) => {
    outcome.status = status;
    if (errorMessage) outcome.errorMessage = errorMessage;
    await db
      .update(sourceSyncRuns)
      .set({
        status: status === 'skipped' ? 'cancelled' : status,
        finishedAt: new Date(),
        recordsReceived: outcome.recordsReceived,
        observationsInserted: outcome.observationsInserted,
        observationsUpdated: outcome.observationsUpdated,
        observationsUnchanged: outcome.observationsUnchanged,
        observationsDeleted: outcome.observationsDeleted,
        itemsCreated: outcome.itemsCreated,
        partialErrors: outcome.partialErrors.slice(0, 100),
        errorMessage: errorMessage ?? null,
      })
      .where(eq(sourceSyncRuns.id, runId));
    return outcome;
  };

  if (!connection || connection.connection.status === 'revoked') return finish('cancelled', 'La conexión está revocada');
  const conn = connection.connection;
  const adapter = registry.get(conn.sourceKey);
  if (!adapter) return finish('failed', `La fuente ${conn.sourceKey} no está disponible en este entorno`);

  // Un solo sync a la vez por conexión (bloqueo de sesión en una conexión dedicada del pool).
  const lockClient = await database.pool.connect();
  const lockKey = `sync:${conn.id}`;
  const locked = await lockClient.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtextextended($1, 0)) as ok', [lockKey]);
  if (!locked.rows[0]?.ok) {
    lockClient.release();
    return finish('cancelled', 'Ya hay otro sync en curso para esta conexión');
  }

  try {
    const cursorBefore = run.mode === 'full' ? null : (conn.syncCursor as SyncCursor | null);
    await db
      .update(sourceSyncRuns)
      .set({ status: 'running', startedAt: new Date(), cursorBefore })
      .where(eq(sourceSyncRuns.id, runId));

    let cursor: SyncCursor | null = cursorBefore;
    let watermark: string | undefined;
    let allSnapshot = true;
    const seen = new Set<string>();
    const affected = new Set<string>();

    for (let page = 0; page < 10_000; page++) {
      const batch = await adapter.sync({
        connection: {
          id: conn.id,
          userId: conn.userId,
          sourceKey: conn.sourceKey as ProfileSourceKey,
          status: conn.status,
          externalAccountRef: conn.externalAccountRef,
          cursor,
          watermarkAt: conn.watermarkAt?.toISOString() ?? null,
        },
        cursor,
        pageSize,
        now: now(),
      });
      outcome.recordsReceived += batch.records.length;
      outcome.partialErrors.push(...batch.partialErrors);
      allSnapshot &&= batch.snapshotComplete;
      if (batch.watermarkAt && (!watermark || batch.watermarkAt > watermark)) watermark = batch.watermarkAt;

      // 1) Normalizar y validar (fuera de la transacción).
      const resolved: Array<{ o: NormalizedObservation; itemId: string }> = [];
      for (const record of batch.records) {
        let observations: NormalizedObservation[];
        try {
          const mapped = await adapter.normalize(record, {
            userId: conn.userId,
            connectionId: conn.id,
            source: conn.sourceKey as ProfileSourceKey,
            ...(batch.stats ? { stats: batch.stats } : {}),
          });
          observations = mapped.map((m) => parseObservation(m));
          for (const o of observations) {
            if (o.userId !== conn.userId || o.source !== conn.sourceKey) {
              throw new Error('La observación no corresponde al usuario o la fuente de la conexión');
            }
          }
        } catch (error) {
          outcome.partialErrors.push({
            ...(recordId(record) ? { sourceRecordId: recordId(record)! } : {}),
            code: 'invalid_record',
            message: describeError(error).slice(0, 500),
          });
          continue;
        }
        // 2) Resolver el objeto canónico (una edición se atribuye a su obra).
        for (const o of observations) {
          const resolution = await resolver.resolve(
            {
              category: o.category,
              itemType: o.externalItem.itemType,
              title: o.externalItem.title,
              sourceKey: o.source,
              sourceId: o.externalItem.sourceId,
              ...(o.externalItem.canonicalIds ? { canonicalIds: o.externalItem.canonicalIds } : {}),
              ...(o.externalItem.attributes ? { attributes: o.externalItem.attributes } : {}),
              ...(o.externalItem.imageCandidate ? { imageCandidate: o.externalItem.imageCandidate } : {}),
            },
            connection.dataset,
          );
          outcome.itemsCreated += resolution.itemsCreated;
          const metadata =
            resolution.itemId !== resolution.targetItemId
              ? { ...(o.metadata ?? {}), resolvedVia: { itemId: resolution.itemId, method: resolution.method } }
              : { ...(o.metadata ?? {}), resolvedVia: { method: resolution.method } };
          resolved.push({ o: { ...o, metadata }, itemId: resolution.targetItemId });
        }
      }

      // 3) Escribir el lote en una transacción que verifica que la conexión sigue activa.
      await db.transaction(async (tx) => {
        await assertActive(tx, conn.id);
        for (const { o, itemId } of resolved) {
          seen.add(`${o.observationKind}\u0000${o.sourceRecordId}`);
          const result = await writeObservation(tx, o, conn.id, itemId);
          if (result.kind === 'inserted') outcome.observationsInserted += 1;
          else if (result.kind === 'updated') outcome.observationsUpdated += 1;
          else outcome.observationsUnchanged += 1;
          if (result.kind !== 'unchanged') {
            affected.add(itemId);
            if (result.previousItemId) affected.add(result.previousItemId);
          }
        }
      });

      cursor = batch.cursor;
      if (!batch.hasMore) break;
    }

    // 4) Instantánea completa y sin errores: lo que ya no aparece deja de ser evidencia vigente.
    const snapshotKinds = adapter.snapshotObservationKinds ?? [];
    await db.transaction(async (tx) => {
      await assertActive(tx, conn.id);
      if (allSnapshot && snapshotKinds.length && outcome.partialErrors.length === 0) {
        const current = await tx
          .select({
            id: userItemObservations.id,
            itemId: userItemObservations.catalogItemId,
            kind: userItemObservations.observationKind,
            recordId: userItemObservations.sourceRecordId,
          })
          .from(userItemObservations)
          .where(and(eq(userItemObservations.connectionId, conn.id), inArray(userItemObservations.observationKind, [...snapshotKinds])));
        const stale = current.filter((c) => !seen.has(`${c.kind}\u0000${c.recordId}`));
        if (stale.length) {
          await tx.delete(userItemObservations).where(inArray(userItemObservations.id, stale.map((s) => s.id)));
          outcome.observationsDeleted = stale.length;
          for (const s of stale) affected.add(s.itemId);
        }
      }
      await recomputeProfiles(tx, conn.userId, affected);
      await tx
        .update(userConnections)
        .set({
          syncCursor: cursor,
          ...(watermark ? { watermarkAt: new Date(watermark) } : {}),
          lastSyncAt: new Date(),
          lastSyncStatus: outcome.partialErrors.length ? 'partial' : 'succeeded',
          lastError: null,
          status: 'active',
          updatedAt: sql`now()`,
        })
        .where(eq(userConnections.id, conn.id));
      await tx.update(sourceSyncRuns).set({ cursorAfter: cursor }).where(eq(sourceSyncRuns.id, runId));
    });

    return await finish(outcome.partialErrors.length ? 'partial' : 'succeeded');
  } catch (error) {
    if (error instanceof ConnectionRevokedError) return finish('cancelled', error.message);
    const message = describeError(error).slice(0, 500);
    // Un error no reintentable (perfil privado, clave no válida…) deja la conexión en «error» hasta que el usuario
    // actúe; un fallo transitorio la deja activa para que el reintento la recupere. La evidencia previa se conserva.
    const needsUserAction = isSourceError(error) && !error.retryable;
    await db
      .update(userConnections)
      .set({
        lastSyncStatus: 'failed',
        lastError: message,
        ...(needsUserAction ? { status: 'error' as const } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(userConnections.id, conn.id));
    await finish('failed', message);
    throw error;
  } finally {
    await lockClient.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]).catch(() => undefined);
    lockClient.release();
  }
}

/** Mensaje legible: los errores de validación (Zod) se resumen como "ruta: motivo". */
export function describeError(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues;
  if (Array.isArray(issues) && issues.length) {
    return issues.map((i) => `${i.path.map(String).join('.') || 'registro'}: ${i.message}`).join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

function recordId(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const r = record as Record<string, unknown>;
  const value = r.id ?? r.entryId ?? r.activityId ?? r.appid;
  return value === undefined ? undefined : String(value);
}
