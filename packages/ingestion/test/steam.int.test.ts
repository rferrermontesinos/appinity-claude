import { EntityResolver, LocalDiskStorage, WikidataSnapshotProvider, cacheCatalogImage } from '@appinity/catalog';
import {
  catalogExternalIds,
  catalogImages,
  createDatabase,
  sourceSyncRuns,
  userConnections,
  userItemObservations,
  userItemProfiles,
  users,
  verifyLocalCode,
  type DatabaseHandle,
} from '@appinity/database';
import { createAdapterRegistry, steamFixtures } from '@appinity/integrations';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ConflictError,
  ForbiddenError,
  completeConnect,
  connectSource,
  createOrResetLocalUser,
  createSyncRun,
  disconnectSource,
  runConnectionSync,
  scheduleDueSyncs,
  seedDemoUsers,
  startConnect,
} from '../src/index.js';

const KEY = '0123456789ABCDEF0123456789ABCDEF';
const { SIMULATED_STEAM_IDS, OWNED_GAMES_HIDDEN, OWNED_GAMES_WITHOUT_CS2, createFakeSteamFetch, openIdCallbackParams } = steamFixtures;
const BASE = 'http://192.168.1.16:3100';

let database: DatabaseHandle;
let ana: string; // usuario real SIMULADO para tests (test_steam_ana)
let bruno: string;
const provider = new WikidataSnapshotProvider();
const fake = { owned: {} as Record<string, unknown>, visibility: {} as Record<string, 1 | 3>, failuresBeforeSuccess: [] as number[] };

/** Registro con Steam apuntando a un fetch simulado cuyo comportamiento se cambia en cada test. */
function registry() {
  const { fetchImpl } = createFakeSteamFetch({
    owned: fake.owned,
    visibility: fake.visibility,
    failuresBeforeSuccess: fake.failuresBeforeSuccess.splice(0),
  });
  return createAdapterRegistry({ demoMode: true, steam: { apiKey: KEY, fetchImpl, sleep: async () => undefined } });
}

async function sync(connectionId: string) {
  const runId = await createSyncRun(database, connectionId, 'user', 'full');
  return runConnectionSync({ database, registry: registry(), resolver: new EntityResolver(database.db, [provider]) }, runId).catch(
    (error: unknown) => ({ error }),
  );
}

async function connectSteam(userId: string, steamid: string) {
  const state = `state-${userId.slice(-6)}-0123456789`;
  const redirectUri = `${BASE}/v1/connect/steam/callback?state=${state}`;
  const start = await startConnect(database.db, registry(), userId, 'steam', { redirectUri, realm: `${BASE}/` });
  expect(start.kind).toBe('redirect');
  return completeConnect(database.db, registry(), userId, 'steam', {
    redirectUri,
    callbackParams: openIdCallbackParams(redirectUri, steamid),
  });
}

async function itemId(steamApp: string) {
  const [row] = await database.db
    .select({ id: catalogExternalIds.catalogItemId })
    .from(catalogExternalIds)
    .where(and(eq(catalogExternalIds.dataset, 'live'), eq(catalogExternalIds.provider, 'steam'), eq(catalogExternalIds.externalId, steamApp)));
  return row?.id;
}

async function profile(userId: string, steamApp: string) {
  const id = await itemId(steamApp);
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
  ana = (await createOrResetLocalUser(database.db, { handle: 'test_steam_ana', displayName: 'Prueba Steam Ana (simulado)' })).userId;
  bruno = (await createOrResetLocalUser(database.db, { handle: 'test_steam_bruno', displayName: 'Prueba Steam Bruno (simulado)' })).userId;
});

afterAll(async () => {
  await database?.close();
});

describe('cuenta local real', () => {
  it('guarda solo el hash del código y regenerarlo invalida el anterior', async () => {
    const first = await createOrResetLocalUser(database.db, { handle: 'test_local_cara', displayName: 'Cara (simulado)' });
    const [row] = await database.db.select().from(users).where(eq(users.id, first.userId));
    expect(row).toMatchObject({ dataset: 'live' });
    expect(row!.localLoginCodeHash).not.toContain(first.code.replace(/-/g, ''));
    expect(verifyLocalCode(first.code, row!.localLoginCodeHash!)).toBe(true);
    const second = await createOrResetLocalUser(database.db, { handle: 'test_local_cara', displayName: 'Cara (simulado)' });
    const [after] = await database.db.select().from(users).where(eq(users.id, first.userId));
    expect(second.created).toBe(false);
    expect(verifyLocalCode(first.code, after!.localLoginCodeHash!)).toBe(false);
    expect(verifyLocalCode(second.code, after!.localLoginCodeHash!)).toBe(true);
  });

  it('no convierte usuarios de demo en cuentas reales', async () => {
    await expect(createOrResetLocalUser(database.db, { handle: 'demo_laura', displayName: 'X' })).rejects.toThrow();
  });
});

describe('conexión con Steam (OpenID simulado)', () => {
  it('un usuario de demo no puede conectar Steam', async () => {
    await expect(
      startConnect(database.db, registry(), '00000000-0000-4000-a000-000000000001', 'steam', { redirectUri: `${BASE}/x`, realm: `${BASE}/` }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('inicia con redirección y completa la conexión guardando solo el SteamID', async () => {
    const connection = await connectSteam(ana, SIMULATED_STEAM_IDS.publicLibrary);
    expect(connection).toMatchObject({ sourceKey: 'steam', status: 'active', externalAccountRef: '76561190000000001' });
  });

  it('una cuenta de Steam no puede vincularse a la vez a dos usuarios', async () => {
    await expect(connectSteam(bruno, SIMULATED_STEAM_IDS.publicLibrary)).rejects.toBeInstanceOf(ConflictError);
  });

  it('una fuente con redirección no se puede conectar como si fuera inmediata', async () => {
    await expect(connectSource(database.db, registry(), bruno, 'steam')).rejects.toThrow();
  });
});

describe('sync de Steam', () => {
  let connectionId: string;
  beforeAll(async () => {
    const [row] = await database.db.select().from(userConnections).where(and(eq(userConnections.userId, ana), eq(userConnections.sourceKey, 'steam')));
    connectionId = row!.id;
  });

  it('importa la biblioteca, deja la entrada corrupta como error parcial y consolida los perfiles', async () => {
    const outcome = await sync(connectionId);
    expect(outcome).toMatchObject({ status: 'partial', observationsInserted: 6, recordsReceived: 6 });
    expect((outcome as { partialErrors: unknown[] }).partialErrors).toHaveLength(1);
  });

  it('juego comprado con 0 horas: conocido, no consumido y sin preferencia', async () => {
    expect(await profile(ana, '1127400')).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null, preferenceBasis: null });
    expect(await profile(ana, '413150')).toMatchObject({ consumedConfidence: 0, preferenceScore: null });
    expect(await profile(ana, '367520')).toMatchObject({ consumedConfidence: 1, preferenceScore: null });
    const hades = await profile(ana, '1145360');
    expect(hades).toMatchObject({ consumedConfidence: 1, preferenceBasis: 'strong_behavior' });
    expect(hades!.preferenceScore!).toBeGreaterThan(0);
  });

  it('repetir el sync no duplica nada', async () => {
    const before = await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connectionId));
    const outcome = await sync(connectionId);
    expect(outcome).toMatchObject({ observationsInserted: 0, observationsUpdated: 0, observationsUnchanged: 6 });
    const after = await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connectionId));
    expect(after).toHaveLength(before.length);
  });

  it('los objetos son del dataset real y el arte de Steam es solo referencia (no se cachea)', async () => {
    const id = await itemId('367520');
    const [image] = await database.db.select().from(catalogImages).where(eq(catalogImages.catalogItemId, id!));
    // Hollow Knight está en la instantánea de Wikidata: imagen libre de Commons; Portal 2 no tiene imagen libre.
    expect(image?.source).toBe('wikimedia_commons');
    const portal2 = await itemId('620');
    const [steamArt] = await database.db.select().from(catalogImages).where(eq(catalogImages.catalogItemId, portal2!));
    expect(steamArt).toMatchObject({ source: 'steam_cdn', restrictions: 'reference-only', licenseUrl: 'https://steamcommunity.com/dev/apiterms' });
    const outcome = await cacheCatalogImage(database.db, new LocalDiskStorage('.data/test-media'), steamArt!.id, async () => {
      throw new Error('no debería descargar');
    });
    expect(outcome).toBe('not_cacheable');
  });

  it('resiste límites de peticiones y fallos transitorios', async () => {
    fake.failuresBeforeSuccess = [429, 500];
    const outcome = await sync(connectionId);
    expect(outcome).toMatchObject({ status: 'partial', observationsUnchanged: 6 });
  });

  it('una biblioteca oculta marca la conexión con error accionable y conserva la evidencia', async () => {
    fake.owned[SIMULATED_STEAM_IDS.publicLibrary] = OWNED_GAMES_HIDDEN;
    const result = await sync(connectionId);
    expect((result as { error: { code: string; retryable: boolean } }).error).toMatchObject({ code: 'profile_inaccessible', retryable: false });
    const [conn] = await database.db.select().from(userConnections).where(eq(userConnections.id, connectionId));
    expect(conn).toMatchObject({ status: 'error', lastSyncStatus: 'failed' });
    expect(conn!.lastError).toMatch(/Detalles de juegos/);
    const kept = await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connectionId));
    expect(kept).toHaveLength(6);
    const [run] = await database.db.select().from(sourceSyncRuns).where(eq(sourceSyncRuns.connectionId, connectionId)).orderBy(sourceSyncRuns.queuedAt);
    expect(run).toBeDefined();
  });

  it('al volver a ser visible se recupera; lo que sale de la biblioteca deja de ser evidencia', async () => {
    fake.owned[SIMULATED_STEAM_IDS.publicLibrary] = OWNED_GAMES_WITHOUT_CS2;
    const outcome = await sync(connectionId);
    expect(outcome).toMatchObject({ status: 'succeeded', observationsDeleted: 1 });
    expect(await profile(ana, '730')).toBeUndefined();
    const [conn] = await database.db.select().from(userConnections).where(eq(userConnections.id, connectionId));
    expect(conn).toMatchObject({ status: 'active', lastError: null });
  });

  it('el programador solo encola fuentes reales vencidas y sin otro sync pendiente', async () => {
    await database.db.update(userConnections).set({ lastSyncAt: new Date('2026-01-01T00:00:00Z') }).where(eq(userConnections.id, connectionId));
    const first = await scheduleDueSyncs(database, registry(), { intervalHours: 24 });
    expect(first.map((d) => d.connectionId)).toEqual([connectionId]);
    const second = await scheduleDueSyncs(database, registry(), { intervalHours: 24 });
    expect(second).toHaveLength(0); // ya hay una ejecución en cola
  });

  it('desconectar y borrar elimina lo importado, los perfiles y el SteamID guardado', async () => {
    const result = await disconnectSource(database.db, registry(), ana, connectionId, { purge: true });
    expect(result.purgedObservations).toBe(5);
    expect(await profile(ana, '1145360')).toBeUndefined();
    const [conn] = await database.db.select().from(userConnections).where(eq(userConnections.id, connectionId));
    expect(conn).toMatchObject({ status: 'revoked', externalAccountRef: null });
    // Liberado el SteamID, otro usuario puede vincularlo.
    await expect(connectSteam(bruno, SIMULATED_STEAM_IDS.publicLibrary)).resolves.toMatchObject({ status: 'active' });
  });
});
