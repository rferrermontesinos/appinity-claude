import { EntityResolver, LocalDiskStorage, cacheCatalogImage, refreshExpiredProviderItems } from '@appinity/catalog';
import {
  catalogExternalIds,
  catalogImages,
  catalogItems,
  createDatabase,
  decryptCredentials,
  sourceCredentials,
  userConnections,
  userItemObservations,
  userItemProfiles,
  type DatabaseHandle,
} from '@appinity/database';
import { TmdbCatalogProvider, createAdapterRegistry, tmdbFixtures } from '@appinity/integrations';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ConflictError,
  ForbiddenError,
  UnavailableError,
  completeConnect,
  createOrResetLocalUser,
  createSyncRun,
  disconnectSource,
  runConnectionSync,
  seedDemoUsers,
  startConnect,
} from '../src/index.js';

const { SIMULATED_TMDB_READ_TOKEN, createFakeTmdbFetch, defaultLists, listItem } = tmdbFixtures;
const KEY = Buffer.alloc(32, 7).toString('base64');
const BASE = 'http://192.168.1.16:3100';
const NOW = new Date('2026-10-08T12:00:00Z');

let database: DatabaseHandle;
let eva: string; // usuario real SIMULADO para tests (test_tmdb_eva)
let fran: string;
let fake = createFakeTmdbFetch();

const options = () => ({ readToken: SIMULATED_TMDB_READ_TOKEN, fetchImpl: fake.fetchImpl, sleep: async () => undefined });
const registry = () => createAdapterRegistry({ demoMode: true, tmdb: options() });
const catalog = () => new TmdbCatalogProvider({ ...options(), now: () => NOW });
const resolver = () => new EntityResolver(database.db, [catalog()]);

async function sync(connectionId: string, credentialsKey: string | null = KEY) {
  const runId = await createSyncRun(database, connectionId, 'user', 'full');
  return runConnectionSync(
    { database, registry: registry(), resolver: resolver(), ...(credentialsKey ? { credentialsKey } : {}) },
    runId,
  ).catch((error: unknown) => ({ error }));
}

/** Flujo completo con TMDb simulado: request token → el usuario aprueba → callback con el token. */
async function connectTmdb(userId: string, credentialsKey: string | null = KEY) {
  const redirectUri = `${BASE}/v1/connect/tmdb/callback/state-${userId.slice(-6)}-0123456789`;
  const start = await startConnect(database.db, registry(), userId, 'tmdb', { redirectUri, ...(credentialsKey ? { credentialsKey } : {}) });
  if (start.kind !== 'redirect') throw new Error('se esperaba redirección');
  const requestToken = start.pending!.requestToken!;
  fake.approve(requestToken);
  return completeConnect(database.db, registry(), userId, 'tmdb', {
    redirectUri,
    callbackParams: { request_token: requestToken, approved: 'true' },
    pending: start.pending!,
    ...(credentialsKey ? { credentialsKey } : {}),
  });
}

async function itemId(idType: 'movie' | 'tv', value: string) {
  const [row] = await database.db
    .select({ id: catalogExternalIds.catalogItemId })
    .from(catalogExternalIds)
    .where(
      and(
        eq(catalogExternalIds.dataset, 'live'),
        eq(catalogExternalIds.provider, 'tmdb'),
        eq(catalogExternalIds.idType, idType),
        eq(catalogExternalIds.externalId, value),
      ),
    );
  return row?.id;
}

async function profile(userId: string, idType: 'movie' | 'tv', value: string) {
  const id = await itemId(idType, value);
  if (!id) return undefined;
  const [row] = await database.db
    .select()
    .from(userItemProfiles)
    .where(and(eq(userItemProfiles.userId, userId), eq(userItemProfiles.catalogItemId, id)));
  return row;
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 6 });
  await truncateAll(database.db);
  await seedDemoUsers(database.db);
  eva = (await createOrResetLocalUser(database.db, { handle: 'test_tmdb_eva', displayName: 'Prueba TMDb Eva (simulado)' })).userId;
  fran = (await createOrResetLocalUser(database.db, { handle: 'test_tmdb_fran', displayName: 'Prueba TMDb Fran (simulado)' })).userId;
});

afterAll(async () => {
  await database?.close();
});

describe('conexión con TMDb (sesión simulada)', () => {
  it('un usuario de demo no puede conectar TMDb', async () => {
    await expect(
      startConnect(database.db, registry(), '00000000-0000-4000-a000-000000000001', 'tmdb', { redirectUri: `${BASE}/x` }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('sin clave de cifrado no se guarda nada y la sesión emitida se revoca en TMDb', async () => {
    await expect(connectTmdb(eva, null)).rejects.toBeInstanceOf(UnavailableError);
    expect(fake.deletedSessions).toHaveLength(1);
    expect(fake.sessions.size).toBe(0);
    const rows = await database.db.select().from(userConnections).where(eq(userConnections.userId, eva));
    expect(rows).toHaveLength(0);
  });

  it('guarda la cuenta como referencia y la sesión solo cifrada, ligada a su conexión', async () => {
    const connection = await connectTmdb(eva);
    expect(connection).toMatchObject({ sourceKey: 'tmdb', status: 'active', externalAccountRef: '90000001' });
    const [stored] = await database.db.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, connection.id));
    const [session] = [...fake.sessions];
    expect(stored!.ciphertext).not.toContain(session);
    expect(decryptCredentials(stored!.ciphertext, KEY, connection.id)).toEqual({ sessionId: session });
    // El texto cifrado copiado a otra conexión no se descifra (AAD = id de conexión).
    expect(() => decryptCredentials(stored!.ciphertext, KEY, '30000000-0000-4000-a000-000000000009')).toThrow();
  });

  it('una cuenta de TMDb no puede vincularse a la vez a dos usuarios (y no deja sesiones huérfanas)', async () => {
    const before = fake.deletedSessions.length;
    await expect(connectTmdb(fran)).rejects.toBeInstanceOf(ConflictError);
    expect(fake.deletedSessions).toHaveLength(before + 1);
  });
});

describe('sync de TMDb', () => {
  let connectionId: string;
  beforeAll(async () => {
    const [row] = await database.db
      .select()
      .from(userConnections)
      .where(and(eq(userConnections.userId, eva), eq(userConnections.sourceKey, 'tmdb')));
    connectionId = row!.id;
  });

  it('una película ya en el catálogo (por IMDb) no se duplica al llegar desde TMDb', async () => {
    // Objeto previo de otra fuente con el mismo ID de IMDb que «Origen».
    const [pre] = await database.db
      .insert(catalogItems)
      .values({ dataset: 'live', category: 'movies', itemType: 'movie', title: 'Inception', normalizedTitle: 'inception', createdVia: 'test' })
      .returning({ id: catalogItems.id });
    await database.db
      .insert(catalogExternalIds)
      .values({ catalogItemId: pre!.id, dataset: 'live', provider: 'imdb', idType: 'title', externalId: 'tt1375666', contributedBy: 'test' });

    const outcome = await sync(connectionId);
    expect(outcome).toMatchObject({ status: 'succeeded', recordsReceived: 7, observationsInserted: 7 });
    expect(await itemId('movie', '27205')).toBe(pre!.id);
    const sameImdb = await database.db.select().from(catalogExternalIds).where(eq(catalogExternalIds.externalId, 'tt1375666'));
    expect(sameImdb).toHaveLength(1);
  });

  it('valorada → explícita; favorita sin consumo; pendiente sin preferencia (NULL, no rechazo)', async () => {
    // Matrix: valorada 8,5 y favorita a la vez; gana la valoración explícita.
    expect(await profile(eva, 'movie', '603')).toMatchObject({
      knownConfidence: 1,
      consumedConfidence: 1,
      preferenceBasis: 'explicit_rating',
      preferenceScore: 0.6842,
    });
    expect(await profile(eva, 'tv', '1399')).toMatchObject({ consumedConfidence: 0, preferenceBasis: 'explicit_like', preferenceScore: 0.8 });
    expect(await profile(eva, 'movie', '129')).toMatchObject({
      knownConfidence: 1,
      consumedConfidence: 0,
      preferenceScore: null,
      preferenceBasis: null,
    });
  });

  it('película y serie con el mismo número son objetos distintos con su categoría', async () => {
    const movie = await itemId('movie', '1396');
    const series = await itemId('tv', '1396');
    expect(movie).toBeDefined();
    expect(series).toBeDefined();
    expect(movie).not.toBe(series);
    const rows = await database.db.select().from(catalogItems).where(sql`${catalogItems.id} in (${movie}, ${series})`);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.category]))).toEqual({ [movie!]: 'movies', [series!]: 'series' });
    expect(await profile(eva, 'tv', '1396')).toMatchObject({ preferenceScore: 1 });
    expect(await profile(eva, 'movie', '1396')).toMatchObject({ preferenceScore: -1 });
  });

  it('el catálogo guarda IMDb y Wikidata, el póster como referencia y la caducidad de 180 días', async () => {
    const id = await itemId('movie', '603');
    const ids = await database.db.select().from(catalogExternalIds).where(eq(catalogExternalIds.catalogItemId, id!));
    expect(ids.map((r) => `${r.provider}:${r.idType}:${r.externalId}`).sort()).toEqual([
      'imdb:title:tt0133093',
      'tmdb:item:movie:603',
      'tmdb:movie:603',
      'wikidata:entity:Q83495',
    ]);
    const [item] = await database.db.select().from(catalogItems).where(eq(catalogItems.id, id!));
    expect(item).toMatchObject({ dataset: 'live', title: 'Matrix', createdVia: 'catalog:tmdb' });
    expect(item!.metadata).toMatchObject({ providerCache: { provider: 'tmdb', expiresAt: '2027-04-06T12:00:00.000Z' } });
    const [image] = await database.db.select().from(catalogImages).where(eq(catalogImages.catalogItemId, id!));
    expect(image).toMatchObject({ source: 'tmdb', restrictions: 'reference-only', attributionRequired: true });
    const outcome = await cacheCatalogImage(database.db, new LocalDiskStorage('.data/test-media'), image!.id, async () => {
      throw new Error('no debería descargar');
    });
    expect(outcome).toBe('not_cacheable');
  });

  it('repetir el sync no duplica nada', async () => {
    const outcome = await sync(connectionId);
    expect(outcome).toMatchObject({ observationsInserted: 0, observationsUpdated: 0, observationsUnchanged: 7, observationsDeleted: 0 });
  });

  it('cambiar una nota actualiza; quitar un favorito deja de ser evidencia sin tocar la valoración', async () => {
    const lists = defaultLists();
    lists['rated/movies'] = [listItem('movie:603', 9), listItem('movie:27205', 3), listItem('movie:1396', 0.5)];
    lists['favorite/movies'] = [];
    fake.lists['rated/movies'] = lists['rated/movies'];
    fake.lists['favorite/movies'] = lists['favorite/movies'];
    const outcome = await sync(connectionId);
    expect(outcome).toMatchObject({ status: 'succeeded', observationsUpdated: 1, observationsDeleted: 1, observationsUnchanged: 5 });
    expect(await profile(eva, 'movie', '603')).toMatchObject({ preferenceBasis: 'explicit_rating', preferenceScore: 0.7895 });
  });

  it('sin la clave de cifrado en el worker el sync falla con un mensaje claro', async () => {
    const outcome = await sync(connectionId, null);
    expect(outcome).toMatchObject({ status: 'failed', errorMessage: expect.stringMatching(/CREDENTIALS_ENCRYPTION_KEY/) });
  });

  it('si el usuario revoca el acceso en TMDb, la conexión pide reconectar y conserva la evidencia', async () => {
    fake.sessions.clear();
    const result = await sync(connectionId);
    expect((result as { error: { code: string; retryable: boolean } }).error).toMatchObject({ code: 'auth', retryable: false });
    const [conn] = await database.db.select().from(userConnections).where(eq(userConnections.id, connectionId));
    expect(conn).toMatchObject({ status: 'error', lastSyncStatus: 'failed' });
    expect(conn!.lastError).toMatch(/vuelve a conectar TMDb/);
    const kept = await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connectionId));
    expect(kept).toHaveLength(6);
  });

  it('el contenido caducado de TMDb se renueva, y si TMDb lo retira se borran su descripción e imagen', async () => {
    const breakingBad = (await itemId('tv', '1396'))!;
    const matrix = (await itemId('movie', '603'))!;
    const [before] = await database.db.select().from(catalogItems).where(eq(catalogItems.id, matrix));
    expect(before!.description).toBe('Ficha simulada para tests.');
    expect(await database.db.select().from(catalogImages).where(eq(catalogImages.catalogItemId, matrix))).toHaveLength(1);
    const later = new Date('2027-05-01T00:00:00Z');
    // Matrix «desaparece» de TMDb: su ficha responde 404.
    const real = fake.fetchImpl;
    fake = {
      ...fake,
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) =>
        String(input instanceof Request ? input.url : input).includes('/3/movie/603')
          ? new Response('{"success":false}', { status: 404 })
          : real(input, init)) as typeof fetch,
    };
    const provider = new TmdbCatalogProvider({ ...options(), now: () => later });
    const result = await refreshExpiredProviderItems(database.db, new EntityResolver(database.db, [provider]), provider, { now: later });
    // Cinco objetos creados desde TMDb («Origen» ya existía por IMDb y no guarda contenido de TMDb).
    expect(result).toEqual({ refreshed: 4, withdrawn: 1, failed: 0 });
    const [renewed] = await database.db.select().from(catalogItems).where(eq(catalogItems.id, breakingBad));
    expect(renewed!.metadata).toMatchObject({ providerCache: { fetchedAt: later.toISOString() } });
    const [withdrawn] = await database.db.select().from(catalogItems).where(eq(catalogItems.id, matrix));
    expect(withdrawn).toMatchObject({ description: null });
    expect(withdrawn!.metadata).toHaveProperty('providerWithdrawn');
    expect(withdrawn!.metadata).not.toHaveProperty('providerCache');
    expect(await database.db.select().from(catalogImages).where(eq(catalogImages.catalogItemId, matrix))).toHaveLength(0);
    // Nada vuelve a caducar hasta dentro de 180 días.
    const again = await refreshExpiredProviderItems(database.db, new EntityResolver(database.db, [provider]), provider, { now: later });
    expect(again).toEqual({ refreshed: 0, withdrawn: 0, failed: 0 });
  });
});

describe('desconexión de TMDb', () => {
  it('si TMDb no confirma la revocación, en APPINITY queda desconectada y lo indica', async () => {
    const [old] = await database.db
      .select()
      .from(userConnections)
      .where(and(eq(userConnections.userId, eva), eq(userConnections.sourceKey, 'tmdb')));
    // Su sesión ya no existe en TMDb (se revocó allí): el DELETE falla.
    const result = await disconnectSource(database.db, registry(), eva, old!.id, { purge: false, credentialsKey: KEY });
    expect(result.providerRevocation).toBe('failed');
    expect(await database.db.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, old!.id))).toHaveLength(0);
    const [conn] = await database.db.select().from(userConnections).where(eq(userConnections.id, old!.id));
    expect(conn).toMatchObject({ status: 'revoked', externalAccountRef: null });
  });

  it('desconectar y borrar revoca la sesión en TMDb, borra credenciales, cuenta y lo importado', async () => {
    fake = createFakeTmdbFetch();
    // Liberada la cuenta de Eva, otro usuario puede vincularla.
    const connection = await connectTmdb(fran);
    expect(await sync(connection.id)).toMatchObject({ status: 'succeeded' });
    const [session] = [...fake.sessions];
    const result = await disconnectSource(database.db, registry(), fran, connection.id, { purge: true, credentialsKey: KEY });
    expect(result).toMatchObject({ providerRevocation: 'revoked', purgedObservations: 7 });
    expect(fake.deletedSessions).toContain(session);
    expect(await database.db.select().from(sourceCredentials).where(eq(sourceCredentials.connectionId, connection.id))).toHaveLength(0);
    const [conn] = await database.db.select().from(userConnections).where(eq(userConnections.id, connection.id));
    expect(conn).toMatchObject({ status: 'revoked', externalAccountRef: null });
    expect(await profile(fran, 'movie', '603')).toBeUndefined();
    // Y Eva puede volver a conectar la misma cuenta.
    await expect(connectTmdb(eva)).resolves.toMatchObject({ status: 'active' });
  });
});
