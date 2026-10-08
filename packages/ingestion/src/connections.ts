import {
  decryptCredentials,
  encryptCredentials,
  providerConsents,
  sourceCredentials,
  sourceSyncRuns,
  userConnections,
  userItemObservations,
  users,
  type Database,
} from '@appinity/database';
import type { AdapterRegistry } from '@appinity/integrations';
import type { AuthResult, ProfileSourceAdapter, ProfileSourceKey, SourceCredentials } from '@appinity/shared';
import { randomUUID } from 'node:crypto';
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

/**
 * Registra consentimiento, conexión y, si las hay, credenciales por usuario cifradas (AES-256-GCM, con el id de la
 * conexión como AAD) en una sola transacción: nunca queda una conexión sin sus credenciales ni al revés.
 */
async function createConnection(
  db: Database,
  userId: string,
  sourceKey: string,
  auth: Extract<AuthResult, { kind: 'connected' }>,
  credentialsKey: string | undefined,
): Promise<ConnectionRow> {
  if (auth.credentials && !credentialsKey) {
    throw new UnavailableError('Falta CREDENTIALS_ENCRYPTION_KEY en el servidor: no se pueden guardar credenciales');
  }
  try {
    return await db.transaction(async (tx) => {
      const [consent] = await tx
        .insert(providerConsents)
        .values({ userId, sourceKey, scopes: auth.scopes, consentVersion: `${sourceKey}:v1` })
        .returning({ id: providerConsents.id });
      const connectionId = randomUUID();
      const [connection] = await tx
        .insert(userConnections)
        .values({
          id: connectionId,
          userId,
          sourceKey,
          status: 'active',
          externalAccountRef: auth.externalAccountRef ?? null,
          consentId: consent!.id,
        })
        .returning();
      if (auth.credentials) {
        await tx.insert(sourceCredentials).values({
          connectionId,
          ciphertext: encryptCredentials(auth.credentials, credentialsKey!, connectionId),
        });
      }
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

/** Revoca en el proveedor unas credenciales recién emitidas que no llegaron a guardarse (best effort). */
async function revokeOrphan(adapter: ProfileSourceAdapter, userId: string, sourceKey: string, credentials: SourceCredentials) {
  await adapter
    .disconnect({ id: '', userId, sourceKey: sourceKey as ProfileSourceKey, status: 'revoked', cursor: null }, credentials)
    .catch(() => undefined);
}

export type ConnectStart =
  | { kind: 'connected'; connection: ConnectionRow }
  /** `pending`: datos del flujo que la API guarda junto al `state` hasta el callback (nunca van al cliente). */
  | { kind: 'redirect'; url: string; pending?: Record<string, string> };

export interface ConnectOptions {
  redirectUri?: string;
  realm?: string;
  /** CREDENTIALS_ENCRYPTION_KEY para cifrar las credenciales por usuario que devuelva el proveedor. */
  credentialsKey?: string;
}

/**
 * Inicia la conexión de una fuente. Las simuladas se conectan al momento; las reales con OpenID/OAuth devuelven la
 * URL del proveedor. Nunca se simula un éxito de autenticación.
 */
export async function startConnect(
  db: Database,
  registry: AdapterRegistry,
  userId: string,
  sourceKey: string,
  options: ConnectOptions = {},
): Promise<ConnectStart> {
  const adapter = await assertCanConnect(db, registry, userId, sourceKey);
  const auth = await adapter.connect({
    userId,
    ...(options.redirectUri ? { redirectUri: options.redirectUri } : {}),
    ...(options.realm ? { realm: options.realm } : {}),
  });
  if (auth.kind === 'unavailable') throw new UnavailableError(auth.reason);
  if (auth.kind === 'redirect') return { kind: 'redirect', url: auth.url, ...(auth.pending ? { pending: auth.pending } : {}) };
  return { kind: 'connected', connection: await createConnection(db, userId, sourceKey, auth, options.credentialsKey) };
}

/** Completa un flujo con redirección: el adapter verifica la respuesta del proveedor antes de crear la conexión. */
export async function completeConnect(
  db: Database,
  registry: AdapterRegistry,
  userId: string,
  sourceKey: string,
  context: {
    redirectUri: string;
    callbackParams: Record<string, string>;
    pending?: Record<string, string>;
    credentialsKey?: string;
  },
): Promise<ConnectionRow> {
  const adapter = await assertCanConnect(db, registry, userId, sourceKey);
  if (!adapter.completeConnect) throw new UnavailableError('Esta fuente no usa redirección');
  const auth = await adapter.completeConnect({
    userId,
    redirectUri: context.redirectUri,
    callbackParams: context.callbackParams,
    ...(context.pending ? { pending: context.pending } : {}),
  });
  if (auth.kind !== 'connected') throw new UnavailableError('El proveedor no confirmó la conexión');
  try {
    return await createConnection(db, userId, sourceKey, auth, context.credentialsKey);
  } catch (error) {
    // Si no se pudo guardar (p. ej. la cuenta ya está vinculada a otro usuario), no se deja viva la sesión emitida.
    if (auth.credentials) await revokeOrphan(adapter, userId, sourceKey, auth.credentials);
    throw error;
  }
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

/** Resultado de la revocación en el proveedor: hecha, fallida (queda borrada en APPINITY) o sin nada que revocar. */
export type ProviderRevocation = 'revoked' | 'failed' | 'not_applicable';

/**
 * Desconecta una fuente: revoca la conexión y el consentimiento, borra credenciales y cancela syncs pendientes.
 * Con `purge`, elimina además las observaciones importadas de esa fuente y recalcula los perfiles afectados,
 * conservando la evidencia de las demás fuentes. Un sync tardío no puede volver a escribir (ver sync-runner).
 * Tras confirmar la transacción se pide al proveedor que invalide el acceso (p. ej. la sesión de TMDb).
 */
export async function disconnectSource(
  db: Database,
  registry: AdapterRegistry,
  userId: string,
  connectionId: string,
  options: { purge: boolean; credentialsKey?: string },
): Promise<{ purgedObservations: number; affectedItems: number; providerRevocation: ProviderRevocation }> {
  const result = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(userConnections)
      .where(and(eq(userConnections.id, connectionId), eq(userConnections.userId, userId)))
      .for('update');
    // Recurso ajeno o inexistente: misma respuesta para no revelar su existencia.
    if (!connection) throw new NotFoundError('Conexión no encontrada');

    let credentials: SourceCredentials | null | undefined;
    if (connection.status !== 'revoked') {
      const [stored] = await tx.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, connectionId));
      if (stored) {
        try {
          credentials = options.credentialsKey ? decryptCredentials(stored.ciphertext, options.credentialsKey, connectionId) : null;
        } catch {
          credentials = null;
        }
      }
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

    if (!options.purge) return { connection, credentials, purgedObservations: 0, affectedItems: 0 };
    const items = await tx
      .selectDistinct({ itemId: userItemObservations.catalogItemId })
      .from(userItemObservations)
      .where(eq(userItemObservations.connectionId, connectionId));
    const deleted = await tx
      .delete(userItemObservations)
      .where(eq(userItemObservations.connectionId, connectionId))
      .returning({ id: userItemObservations.id });
    await recomputeProfiles(tx, userId, items.map((i) => i.itemId));
    return { connection, credentials, purgedObservations: deleted.length, affectedItems: items.length };
  });

  // undefined: la conexión no guardaba credenciales; null: existían pero no se pudieron descifrar.
  let providerRevocation: ProviderRevocation = result.credentials === undefined ? 'not_applicable' : 'failed';
  const adapter = registry.get(result.connection.sourceKey);
  if (adapter && result.connection.status !== 'revoked') {
    try {
      await adapter.disconnect(
        { id: result.connection.id, userId, sourceKey: result.connection.sourceKey as ProfileSourceKey, status: 'revoked', cursor: null },
        result.credentials ?? undefined,
      );
      if (result.credentials) providerRevocation = 'revoked';
    } catch {
      if (result.credentials) providerRevocation = 'failed';
    }
  }
  return { purgedObservations: result.purgedObservations, affectedItems: result.affectedItems, providerRevocation };
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
