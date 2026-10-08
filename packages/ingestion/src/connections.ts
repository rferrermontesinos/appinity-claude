import {
  providerConsents,
  sourceCredentials,
  sourceSyncRuns,
  userConnections,
  userItemObservations,
  users,
  type Database,
} from '@appinity/database';
import type { AdapterRegistry } from '@appinity/integrations';
import type { AuthResult, ProfileSourceKey } from '@appinity/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { ConflictError, ForbiddenError, NotFoundError, UnavailableError } from './errors.js';
import { recomputeProfiles } from './profiles.js';

export type ConnectionRow = typeof userConnections.$inferSelect;

/**
 * Comprueba que el usuario puede conectar la fuente: existe el adapter, coincide el dataset (fuentes simuladas solo
 * para usuarios de demo, reales solo para usuarios reales) y no hay ya una conexión abierta.
 */
async function assertCanConnect(db: Database, registry: AdapterRegistry, userId: string, sourceKey: string) {
  const adapter = registry.get(sourceKey);
  if (!adapter) throw new UnavailableError(`La fuente ${sourceKey} no está disponible en este servidor`);
  const [user] = await db.select({ dataset: users.dataset }).from(users).where(eq(users.id, userId));
  if (!user) throw new NotFoundError('Usuario no encontrado');
  if (adapter.manifest.simulated !== (user.dataset === 'demo')) {
    throw new ForbiddenError(
      adapter.manifest.simulated
        ? 'Las fuentes simuladas solo pueden usarlas usuarios de demo'
        : 'Los usuarios de demo no pueden conectar fuentes reales: usa una cuenta local real (pnpm user:local)',
    );
  }
  if (await findOpenConnection(db, userId, sourceKey)) throw new ConflictError('Esta fuente ya está conectada');
  return adapter;
}

/** Registra consentimiento y conexión a partir de una autenticación ya verificada. */
async function createConnection(
  db: Database,
  userId: string,
  sourceKey: string,
  auth: Extract<AuthResult, { kind: 'connected' }>,
): Promise<ConnectionRow> {
  if (auth.credentials) {
    throw new UnavailableError('Esta fuente necesita guardar credenciales por usuario, algo que aún no está activado');
  }
  try {
    return await db.transaction(async (tx) => {
      const [consent] = await tx
        .insert(providerConsents)
        .values({ userId, sourceKey, scopes: auth.scopes, consentVersion: `${sourceKey}:v1` })
        .returning({ id: providerConsents.id });
      const [connection] = await tx
        .insert(userConnections)
        .values({
          userId,
          sourceKey,
          status: 'active',
          externalAccountRef: auth.externalAccountRef ?? null,
          consentId: consent!.id,
        })
        .returning();
      return connection!;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        hasConstraint(error, 'user_connections_one_open_per_external_account')
          ? 'Esta cuenta externa ya está vinculada a otro usuario de APPINITY'
          : 'Esta fuente ya está conectada',
      );
    }
    throw error;
  }
}

export type ConnectStart =
  | { kind: 'connected'; connection: ConnectionRow }
  | { kind: 'redirect'; url: string };

/**
 * Inicia la conexión de una fuente. Las simuladas se conectan al momento; las reales con OpenID/OAuth devuelven la
 * URL del proveedor. Nunca se simula un éxito de autenticación.
 */
export async function startConnect(
  db: Database,
  registry: AdapterRegistry,
  userId: string,
  sourceKey: string,
  redirect: { redirectUri?: string; realm?: string } = {},
): Promise<ConnectStart> {
  const adapter = await assertCanConnect(db, registry, userId, sourceKey);
  const auth = await adapter.connect({ userId, ...redirect });
  if (auth.kind === 'unavailable') throw new UnavailableError(auth.reason);
  if (auth.kind === 'redirect') return { kind: 'redirect', url: auth.url };
  return { kind: 'connected', connection: await createConnection(db, userId, sourceKey, auth) };
}

/** Completa un flujo con redirección: el adapter verifica la respuesta del proveedor antes de crear la conexión. */
export async function completeConnect(
  db: Database,
  registry: AdapterRegistry,
  userId: string,
  sourceKey: string,
  context: { redirectUri: string; callbackParams: Record<string, string> },
): Promise<ConnectionRow> {
  const adapter = await assertCanConnect(db, registry, userId, sourceKey);
  if (!adapter.completeConnect) throw new UnavailableError('Esta fuente no usa redirección');
  const auth = await adapter.completeConnect({ userId, ...context });
  if (auth.kind !== 'connected') throw new UnavailableError('El proveedor no confirmó la conexión');
  return createConnection(db, userId, sourceKey, auth);
}

/** Atajo para fuentes sin redirección (simuladas, seed y tests). */
export async function connectSource(
  db: Database,
  registry: AdapterRegistry,
  userId: string,
  sourceKey: string,
): Promise<ConnectionRow> {
  const result = await startConnect(db, registry, userId, sourceKey);
  if (result.kind === 'redirect') throw new UnavailableError('Esta fuente requiere iniciar sesión en el proveedor');
  return result.connection;
}

function hasConstraint(error: unknown, name: string): boolean {
  const e = error as { constraint?: string; cause?: { constraint?: string } };
  return e?.constraint === name || e?.cause?.constraint === name;
}

/**
 * Desconecta una fuente: revoca la conexión y el consentimiento, borra credenciales y cancela syncs pendientes.
 * Con `purge`, elimina además las observaciones importadas de esa fuente y recalcula los perfiles afectados,
 * conservando la evidencia de las demás fuentes. Un sync tardío no puede volver a escribir (ver sync-runner).
 */
export async function disconnectSource(
  db: Database,
  registry: AdapterRegistry,
  userId: string,
  connectionId: string,
  options: { purge: boolean },
): Promise<{ purgedObservations: number; affectedItems: number }> {
  const result = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(userConnections)
      .where(and(eq(userConnections.id, connectionId), eq(userConnections.userId, userId)))
      .for('update');
    // Recurso ajeno o inexistente: misma respuesta para no revelar su existencia.
    if (!connection) throw new NotFoundError('Conexión no encontrada');

    if (connection.status !== 'revoked') {
      await tx
        .update(userConnections)
        // Minimización: al revocar se olvida también la cuenta externa vinculada (p. ej. el SteamID).
        .set({ status: 'revoked', revokedAt: new Date(), syncCursor: null, externalAccountRef: null, updatedAt: sql`now()` })
        .where(eq(userConnections.id, connectionId));
      if (connection.consentId) {
        await tx.update(providerConsents).set({ revokedAt: new Date() }).where(eq(providerConsents.id, connection.consentId));
      }
      await tx.delete(sourceCredentials).where(eq(sourceCredentials.connectionId, connectionId));
      await tx
        .update(sourceSyncRuns)
        .set({ status: 'cancelled', finishedAt: new Date(), errorMessage: 'Conexión revocada' })
        .where(and(eq(sourceSyncRuns.connectionId, connectionId), inArray(sourceSyncRuns.status, ['queued', 'running'])));
    }

    if (!options.purge) return { connection, purgedObservations: 0, affectedItems: 0 };
    const items = await tx
      .selectDistinct({ itemId: userItemObservations.catalogItemId })
      .from(userItemObservations)
      .where(eq(userItemObservations.connectionId, connectionId));
    const deleted = await tx
      .delete(userItemObservations)
      .where(eq(userItemObservations.connectionId, connectionId))
      .returning({ id: userItemObservations.id });
    await recomputeProfiles(tx, userId, items.map((i) => i.itemId));
    return { connection, purgedObservations: deleted.length, affectedItems: items.length };
  });

  const adapter = registry.get(result.connection.sourceKey);
  await adapter
    ?.disconnect({
      id: result.connection.id,
      userId,
      sourceKey: result.connection.sourceKey as ProfileSourceKey,
      status: 'revoked',
      cursor: null,
    })
    .catch(() => undefined);
  return { purgedObservations: result.purgedObservations, affectedItems: result.affectedItems };
}

/** Violación de unicidad de PostgreSQL (Drizzle la envuelve y deja el error original en `cause`). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Conexión no revocada de un usuario para una fuente, si existe. */
export async function findOpenConnection(db: Database, userId: string, sourceKey: string): Promise<ConnectionRow | null> {
  const [row] = await db
    .select()
    .from(userConnections)
    .where(and(eq(userConnections.userId, userId), eq(userConnections.sourceKey, sourceKey), ne(userConnections.status, 'revoked')));
  return row ?? null;
}
