import { EntityResolver, WikidataSnapshotProvider } from '@appinity/catalog';
import {
  catalogExternalIds,
  catalogItems,
  createDatabase,
  decryptCredentials,
  sourceCredentials,
  sourceSyncRuns,
  userConnections,
  userItemObservations,
  userItemProfiles,
  type DatabaseHandle,
} from '@appinity/database';
import { createAdapterRegistry, googleFixtures } from '@appinity/integrations';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ForbiddenError,
  completeConnect,
  createOrResetLocalUser,
  createSyncRun,
  disconnectSource,
  runConnectionSync,
  seedDemoUsers,
  startConnect,
} from '../src/index.js';

const { FAKE_CLIENT, createFakeGoogle, createFakeIdentifier, defaultExports } = googleFixtures;
const KEY = Buffer.alloc(32, 7).toString('base64');

let database: DatabaseHandle;
let gala: string; // usuario real SIMULADO para tests (test_google_gala)
const exports = defaultExports();
const google = createFakeGoogle({ exports, pollsBeforeComplete: 1 });
const { identifier } = createFakeIdentifier();
let clock = new Date();

const registry = () =>
  createAdapterRegistry({ demoMode: true, google: { ...FAKE_CLIENT, fetchImpl: google.fetchImpl, sleep: async () => undefined, identifier } });
const deps = () => ({
  database,
  registry: registry(),
  resolver: new EntityResolver(database.db, [new WikidataSnapshotProvider()]),
  credentialsKey: KEY,
  now: () => clock,
});

async function authorize(userId: string) {
  const state = `estado-${userId.slice(-6)}-0123456789`;
  const start = await startConnect(database.db, registry(), userId, 'google_portability', { state, credentialsKey: KEY });
  if (start.kind !== 'redirect') throw new Error('se esperaba redirección');
  const code = google.approve(start.url);
  const connection = await completeConnect(database.db, registry(), userId, 'google_portability', {
    redirectUri: FAKE_CLIENT.redirectUri,
    callbackParams: { code, state },
    pending: start.pending!,
    credentialsKey: KEY,
  });
  return { start, connection };
}

async function profileByWikidata(userId: string, qid: string) {
  const [row] = await database.db
    .select({ profile: userItemProfiles })
    .from(userItemProfiles)
    .innerJoin(catalogExternalIds, eq(catalogExternalIds.catalogItemId, userItemProfiles.catalogItemId))
    .where(and(eq(userItemProfiles.userId, userId), eq(catalogExternalIds.provider, 'wikidata'), eq(catalogExternalIds.externalId, qid), eq(catalogExternalIds.dataset, 'live')));
  return row?.profile;
}

async function credentialsOf(connectionId: string) {
  const [stored] = await database.db.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, connectionId));
  return stored ? decryptCredentials(stored.ciphertext, KEY, connectionId) : undefined;
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 6 });
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  gala = (await createOrResetLocalUser(database.db, { handle: 'test_google_gala', displayName: 'Prueba Google Gala (simulado)' })).userId;
});

afterAll(async () => {
  await database?.close();
});

describe('conexión con Google (OAuth simulado)', () => {
  it('un usuario de demo no puede conectar Google', async () => {
    await expect(
      startConnect(database.db, registry(), '00000000-0000-4000-a000-000000000001', 'google_portability', { state: 'estado-0123456789abcdef' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('una autorización crea la conexión sin cuenta externa y con el refresh token solo cifrado', async () => {
    const { start, connection } = await authorize(gala);
    expect(start).toMatchObject({ kind: 'redirect', renewal: false, localOnly: true });
    expect(connection).toMatchObject({ sourceKey: 'google_portability', status: 'active', externalAccountRef: null });
    const [stored] = await database.db.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, connection.id));
    expect(stored!.ciphertext).not.toContain('refresh-simulado');
    expect(await credentialsOf(connection.id)).toMatchObject({ refreshToken: expect.stringMatching(/^refresh-simulado-/) });
  });
});

describe('sync de Google', () => {
  let connectionId: string;
  let runId: string;
  beforeAll(async () => {
    const [row] = await database.db.select().from(userConnections).where(and(eq(userConnections.userId, gala), eq(userConnections.sourceKey, 'google_portability')));
    connectionId = row!.id;
  });

  it('mientras Google prepara el export la ejecución se aplaza sin escribir y guarda los trabajos cifrados', async () => {
    runId = await createSyncRun(database, connectionId, 'connect', 'full');
    const outcome = await runConnectionSync(deps(), runId);
    expect(outcome).toMatchObject({ status: 'deferred', retryAfterMs: 60_000, observationsInserted: 0 });
    const [run] = await database.db.select().from(sourceSyncRuns).where(eq(sourceSyncRuns.id, runId));
    expect(run!.status).toBe('queued');
    expect(Object.keys(JSON.parse((await credentialsOf(connectionId))!.jobs!))).toHaveLength(5);
  });

  it('la misma ejecución se reanuda e importa lo identificado; lo no identificado se informa sin bloquear', async () => {
    const outcome = await runConnectionSync(deps(), runId);
    expect(outcome).toMatchObject({ status: 'partial', recordsReceived: 8, observationsInserted: 8 });
    // La ferretería y «Moana» no se identifican; el lugar sin coordenadas está incompleto. Ninguno bloquea.
    expect(outcome.partialErrors.map((e) => e.code).sort()).toEqual(['invalid_record', 'unidentified', 'unidentified']);
    expect(outcome.partialErrors.every((e) => e.blocking === false)).toBe(true);
    expect(JSON.parse((await credentialsOf(connectionId))!.jobs!)).toEqual({});
  });

  it('reseña de Maps: valoración explícita con fecha sobre un lugar con ubicación; guardado: solo conocido', async () => {
    const picasso = await profileByWikidata(gala, 'Q368277');
    expect(picasso).toMatchObject({ preferenceScore: 1, preferenceBasis: 'explicit_rating', consumedConfidence: 0.95 });
    const [item] = await database.db.select().from(catalogItems).where(eq(catalogItems.id, picasso!.catalogItemId));
    expect(item).toMatchObject({ dataset: 'live', category: 'culture', itemType: 'museum' });
    expect(item!.latitude).toBeCloseTo(41.38522, 4);
    expect(await profileByWikidata(gala, 'Q48435')).toMatchObject({ knownConfidence: 0.95, consumedConfidence: 0, preferenceScore: null });
    const [review] = await database.db.select().from(userItemObservations).where(eq(userItemObservations.sourceRecordId, 'place:cid:1111111111111111111'));
    expect(review!.occurredAt?.toISOString()).toBe('2026-05-10T19:30:00.000Z');
    expect(JSON.stringify(review!.metadata)).not.toContain('NO debe guardarse');
  });

  it('Búsqueda: estrellas, pulgares y «visto» en sus categorías, ponderados por la identificación', async () => {
    expect(await profileByWikidata(gala, 'Q1079')).toMatchObject({ preferenceScore: 1, preferenceBasis: 'explicit_rating' });
    expect(await profileByWikidata(gala, 'Q44190')).toMatchObject({ preferenceScore: 0.8, preferenceBasis: 'explicit_like' });
    // Casablanca: 2 estrellas y marcada como vista. Se reutiliza el objeto real de la instantánea de Wikidata (Q132689).
    const casablanca = await profileByWikidata(gala, 'Q132689');
    expect(casablanca).toMatchObject({ preferenceScore: -0.5, preferenceBasis: 'explicit_rating', consumedConfidence: 0.65 });
  });

  it('antes de 24 h no se repite el export: sync sin cambios y sin retirar evidencia', async () => {
    const outcome = await runConnectionSync(deps(), await createSyncRun(database, connectionId, 'user', 'full'));
    expect(outcome).toMatchObject({ status: 'succeeded', observationsInserted: 0, observationsDeleted: 0 });
  });

  it('pasadas 24 h, lo que desaparece de un grupo deja de ser evidencia y el resto no cambia', async () => {
    const reviews = exports['maps.reviews']!['Portability/Maps (your places)/Reviews.json'] as { features: Array<{ location?: Array<{ name: string }> }> };
    reviews.features = reviews.features.filter((f) => f.location?.[0]?.name !== 'Restaurante Can Culleretes');
    google.allowNewExports();
    clock = new Date(Date.now() + 25 * 3600_000);
    const id = await createSyncRun(database, connectionId, 'schedule', 'full');
    expect(await runConnectionSync(deps(), id)).toMatchObject({ status: 'deferred' });
    const outcome = await runConnectionSync(deps(), id);
    expect(outcome).toMatchObject({ observationsDeleted: 1, observationsInserted: 0, observationsUnchanged: 7 });
    const left = await database.db.select().from(userItemObservations).where(eq(userItemObservations.sourceRecordId, 'place:cid:2222162186422964967'));
    expect(left).toHaveLength(0);
  });

  it('renovar el permiso reutiliza la conexión, sustituye las credenciales y conserva la evidencia', async () => {
    const before = await credentialsOf(connectionId);
    await database.db.update(userConnections).set({ status: 'error', lastError: 'El permiso de Google ha caducado' }).where(eq(userConnections.id, connectionId));
    const { start, connection } = await authorize(gala);
    expect(start).toMatchObject({ renewal: true });
    expect(connection).toMatchObject({ id: connectionId, status: 'active', lastError: null });
    const after = await credentialsOf(connectionId);
    expect(after!.refreshToken).not.toBe(before!.refreshToken);
    const kept = await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connectionId));
    expect(kept).toHaveLength(7);
  });

  it('desconectar y borrar revoca el permiso en Google, borra credenciales y lo importado', async () => {
    const result = await disconnectSource(database.db, registry(), gala, connectionId, { purge: true, credentialsKey: KEY });
    expect(result).toMatchObject({ providerRevocation: 'revoked', purgedObservations: 7 });
    expect(google.resets()).toBe(1);
    expect(await credentialsOf(connectionId)).toBeUndefined();
    expect(await profileByWikidata(gala, 'Q1079')).toBeUndefined();
  });
});
