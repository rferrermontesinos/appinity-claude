import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sourceSyncRuns, userConnections, userItemObservations, type DatabaseHandle } from '@appinity/database';
import {
  completeConnect,
  createSyncRun,
  startConnect,
  disconnectSource,
  enqueueSync,
  NotFoundError,
  UnavailableError,
  type ProducerQueues,
  type SyncMode,
  type SyncTrigger,
} from '@appinity/ingestion';
import type { AdapterRegistry } from '@appinity/integrations';
import type { ConnectStartDto, ConnectionDto, SyncRunDto } from '@appinity/shared';
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { ADAPTER_REGISTRY, DATABASE, QUEUES, REDIS } from '../infra/tokens.js';

const CONNECT_STATE_TTL_SECONDS = 600;

interface PendingConnect {
  userId: string;
  sourceKey: string;
  redirectUri: string;
  returnUrl?: string;
  /** Datos del flujo del proveedor (p. ej. el request token de TMDb). Solo en Redis, nunca van al cliente. */
  provider?: Record<string, string>;
}

/** Pista de la cuenta externa sin exponerla entera (p. ej. «SteamID …4821»). */
function accountHint(sourceKey: string, ref: string | null): string | null {
  if (!ref || sourceKey.startsWith('fixture_')) return null;
  if (sourceKey === 'steam') return `SteamID …${ref.slice(-4)}`;
  if (sourceKey === 'tmdb') return `Cuenta TMDb …${ref.slice(-4)}`;
  return `…${ref.slice(-4)}`;
}

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
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_ENV) private readonly env: AppEnv,
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
      externalAccountHint: accountHint(r.sourceKey, r.externalAccountRef),
    }));
  }

  /**
   * Inicia la conexión. Fuentes simuladas: se conectan y encolan su primer sync. Fuentes con OpenID/OAuth: se guarda
   * un `state` de un solo uso (10 min) y se devuelve la URL del proveedor; la conexión se crea en el callback.
   */
  async connect(userId: string, sourceKey: string, baseUrl: string, returnUrl: string | undefined): Promise<ConnectStartDto> {
    const state = randomBytes(24).toString('base64url');
    // El state va en la ruta: algunos proveedores (TMDb) añaden su propia query a la URL de vuelta.
    const redirectUri = `${baseUrl}/v1/connect/${sourceKey}/callback/${state}`;
    const result = await startConnect(this.database.db, this.registry, userId, sourceKey, {
      redirectUri,
      realm: `${baseUrl}/`,
      ...this.credentialsOption(),
    });
    if (result.kind === 'redirect') {
      const pending: PendingConnect = {
        userId,
        sourceKey,
        redirectUri,
        ...(returnUrl ? { returnUrl } : {}),
        ...(result.pending ? { provider: result.pending } : {}),
      };
      await this.redis.set(this.stateKey(state), JSON.stringify(pending), 'EX', CONNECT_STATE_TTL_SECONDS);
      return {
        kind: 'redirect',
        authorizationUrl: result.url,
        expiresAt: new Date(Date.now() + CONNECT_STATE_TTL_SECONDS * 1000).toISOString(),
      };
    }
    return this.afterConnected(userId, result.connection.id);
  }

  private credentialsOption(): { credentialsKey?: string } {
    return this.env.CREDENTIALS_ENCRYPTION_KEY ? { credentialsKey: this.env.CREDENTIALS_ENCRYPTION_KEY } : {};
  }

  private stateKey(state: string): string {
    return `${this.env.QUEUE_PREFIX}:connect-state:${state}`;
  }

  private async afterConnected(userId: string, connectionId: string): Promise<ConnectStartDto & { kind: 'connected' }> {
    const run = await this.startSync(userId, connectionId, 'connect', 'full');
    const dto = (await this.list(userId)).find((c) => c.id === connectionId)!;
    return { kind: 'connected', connection: dto, run };
  }

  /**
   * Callback del proveedor. El `state` es de un solo uso (GETDEL) y liga la respuesta al usuario que inició el
   * flujo; el adapter verifica la respuesta (OpenID check_authentication) antes de crear la conexión.
   */
  async completeCallback(
    sourceKey: string,
    state: string,
    callbackParams: Record<string, string>,
  ): Promise<{ returnUrl?: string; result: ConnectStartDto & { kind: 'connected' } }> {
    const raw = await this.redis.getdel(this.stateKey(state));
    if (!raw) throw new UnavailableError('La solicitud de conexión ha caducado o ya se usó: vuelve a intentarlo desde la app');
    const pending = JSON.parse(raw) as PendingConnect;
    if (pending.sourceKey !== sourceKey) throw new UnavailableError('La respuesta no corresponde a esta fuente');
    const connection = await completeConnect(this.database.db, this.registry, pending.userId, sourceKey, {
      redirectUri: pending.redirectUri,
      callbackParams,
      ...(pending.provider ? { pending: pending.provider } : {}),
      ...this.credentialsOption(),
    });
    return { ...(pending.returnUrl ? { returnUrl: pending.returnUrl } : {}), result: await this.afterConnected(pending.userId, connection.id) };
  }

  /** Recupera la URL de vuelta a la app aunque la verificación falle (para mostrar el error en la app). */
  async peekReturnUrl(state: string): Promise<string | undefined> {
    const raw = await this.redis.get(this.stateKey(state));
    return raw ? (JSON.parse(raw) as PendingConnect).returnUrl : undefined;
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
    const result = await disconnectSource(this.database.db, this.registry, userId, connectionId, {
      purge,
      ...this.credentialsOption(),
    });
    // Detener los trabajos que aún esperan en la cola (los que ya corren se cancelan al comprobar el estado).
    await Promise.allSettled(pending.map((p) => this.queues.profileSync.remove(p.id)));
    return result;
  }
}
