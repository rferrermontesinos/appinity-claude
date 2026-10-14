import { EntityResolver, WikidataSnapshotProvider } from '@appinity/catalog';
import {
  catalogExternalIds,
  catalogItems,
  createDatabase,
  providerConsents,
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
    // 5 grupos de valoraciones y lugares (fase 3) y 3 de YouTube (fase 4).
    expect(Object.keys(JSON.parse((await credentialsOf(connectionId))!.jobs!))).toHaveLength(8);
  });

  it('la misma ejecución se reanuda e importa lo identificado; lo no identificado se informa sin bloquear', async () => {
    const outcome = await runConnectionSync(deps(), runId);
    // 8 de valoraciones y lugares y 4 de YouTube (escuchas de Radiohead y del podcast, suscripción y biblioteca).
    expect(outcome).toMatchObject({ status: 'partial', recordsReceived: 12, observationsInserted: 12 });
    // No se identifican: la ferretería, «Moana», el vlog (escuchas y suscripción) y un artista de la biblioteca.
    // Incompletos: el lugar sin coordenadas y la canción sin artista. Ninguno bloquea.
    expect(outcome.partialErrors.map((e) => e.code).sort()).toEqual([
      'invalid_record',
      'invalid_record',
      'unidentified',
      'unidentified',
      'unidentified',
      'unidentified',
      'unidentified',
    ]);
    expect(outcome.partialErrors.find((e) => e.message.includes('canales vistos'))!.message).toBe(
      '1 de 4 canales vistos o escuchados en YouTube no se importan: 1 son canales fuera de las categorías de APPINITY (persona)',
    );
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

  it('YouTube: escuchas agregadas por artista (canal oficial + «Topic») y por programa; suscripción y biblioteca solo conocidas', async () => {
    const observations = await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connectionId));
    const byKind = (kind: string, recordId: string) => observations.find((o) => o.observationKind === kind && o.sourceRecordId === recordId);
    // Radiohead: 4 escuchas en YouTube Music + 2 vídeos del canal oficial = 6; es su propio p95 → preferencia 1.
    expect(byKind('yt_plays', 'wd:Q44190')).toMatchObject({
      knownConfidence: 0.95,
      consumedConfidence: 0.95,
      preferenceScore: 1,
      preferenceConfidence: 0.57,
      preferenceBasis: 'strong_behavior',
      engagement: { type: 'listened', value: 6, unit: 'plays' },
      metadata: expect.objectContaining({ plays: 6, musicPlays: 4, channels: 2 }),
    });
    // Una sola escucha del podcast: consumido, pero sin preferencia (§9).
    expect(byKind('yt_plays', 'wd:Q999999999')).toMatchObject({ consumedConfidence: 0.95, preferenceScore: null, preferenceBasis: null });
    expect(byKind('yt_subscription', 'wd:Q44190')).toMatchObject({ knownConfidence: 0.95, consumedConfidence: 0, preferenceScore: null });
    // Biblioteca: «Radiohead» y «Radiohead - Topic» son el mismo artista (2 canciones); identificado por nombre (0,8).
    expect(byKind('ytm_library', 'wd:Q44190')).toMatchObject({ knownConfidence: 0.8, consumedConfidence: 0, engagement: { type: 'saved', value: 2 } });
    const [podcast] = await database.db
      .select({ item: catalogItems })
      .from(catalogItems)
      .innerJoin(userItemObservations, eq(userItemObservations.catalogItemId, catalogItems.id))
      .where(eq(userItemObservations.sourceRecordId, 'wd:Q999999999'));
    expect(podcast!.item).toMatchObject({ category: 'podcasts', itemType: 'podcast' });
    // Ningún título de vídeo ni búsqueda se guarda.
    expect(JSON.stringify(observations)).not.toMatch(/vídeo simulado|Has buscado/);
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
    expect(outcome).toMatchObject({ observationsDeleted: 1, observationsInserted: 0, observationsUnchanged: 11 });
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
    expect(kept).toHaveLength(11);
  });

  it('pedir permisos nuevos (YouTube) sobre una conexión antigua libera antes la concesión: Google no admite autorización incremental', async () => {
    const [row] = await database.db.select().from(userConnections).where(eq(userConnections.id, connectionId));
    const [consent] = await database.db.select().from(providerConsents).where(eq(providerConsents.id, row!.consentId!));
    // Como si se hubiera autorizado en la fase 3, sin los grupos de YouTube.
    await database.db.update(providerConsents).set({ scopes: consent!.scopes.filter((sc) => !/youtube/.test(sc)) }).where(eq(providerConsents.id, consent!.id));
    const before = await credentialsOf(connectionId);
    const resetsBefore = google.resets();
    const state = 'estado-renovacion-0123456789';
    const start = await startConnect(database.db, registry(), gala, 'google_portability', { state, credentialsKey: KEY });
    expect(start).toMatchObject({ kind: 'redirect', renewal: true });
    // Concesión anterior liberada en Google y credenciales borradas; la conexión espera a que se complete el permiso.
    expect(google.resets()).toBe(resetsBefore + 1);
    expect(google.revoked).toContain(before!.refreshToken);
    expect(await credentialsOf(connectionId)).toBeUndefined();
    const [waiting] = await database.db.select().from(userConnections).where(eq(userConnections.id, connectionId));
    expect(waiting!.status).toBe('error');
    // Lo importado sigue ahí.
    expect(await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connectionId))).toHaveLength(11);
    // Al completar, la conexión vuelve a estar activa con los 8 permisos.
    const code = google.approve((start as { url: string }).url);
    const done = await completeConnect(database.db, registry(), gala, 'google_portability', {
      redirectUri: FAKE_CLIENT.redirectUri,
      callbackParams: { code, state },
      pending: (start as { pending: Record<string, string> }).pending,
      credentialsKey: KEY,
    });
    expect(done).toMatchObject({ id: connectionId, status: 'active' });
    const [renewed] = await database.db.select().from(providerConsents).where(eq(providerConsents.id, row!.consentId!));
    expect(renewed!.scopes.filter((sc) => /youtube/.test(sc))).toHaveLength(3);
    // Con todos los permisos, renovar otra vez no libera nada.
    const resets = google.resets();
    await startConnect(database.db, registry(), gala, 'google_portability', { state: 'estado-otra-0123456789ab', credentialsKey: KEY });
    expect(google.resets()).toBe(resets);
  });

  it('desconectar y borrar revoca el permiso en Google, borra credenciales y lo importado', async () => {
    const result = await disconnectSource(database.db, registry(), gala, connectionId, { purge: true, credentialsKey: KEY });
    expect(result).toMatchObject({ providerRevocation: 'revoked', purgedObservations: 11 });
    expect(google.resets()).toBe(2);
    expect(await credentialsOf(connectionId)).toBeUndefined();
    expect(await profileByWikidata(gala, 'Q1079')).toBeUndefined();
  });
});
