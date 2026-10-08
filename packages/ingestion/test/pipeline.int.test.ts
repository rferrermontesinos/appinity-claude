import { EntityResolver, WikidataSnapshotProvider } from '@appinity/catalog';
import {
  catalogExternalIds,
  catalogImages,
  catalogItems,
  createDatabase,
  providerConsents,
  sourceSyncRuns,
  userConnections,
  userItemObservations,
  userItemProfiles,
  userProfiles,
  userSettings,
  users,
  type DatabaseHandle,
} from '@appinity/database';
import { createAdapterRegistry, createFixtureAdapter, type AdapterRegistry } from '@appinity/integrations';
import type { ProfileSourceAdapter } from '@appinity/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import {
  ForbiddenError,
  connectSource,
  createSyncRun,
  disconnectSource,
  findOpenConnection,
  runConnectionSync,
  seedDemo,
  type DemoSeedSummary,
} from '../src/index.js';

const LAURA = '00000000-0000-4000-a000-000000000001';
const ALEX = '00000000-0000-4000-a000-000000000002';
const JORDI = '00000000-0000-4000-a000-000000000004';
const LIVE_USER = '10000000-0000-4000-a000-000000000009';

let database: DatabaseHandle;
let firstSeed: DemoSeedSummary;
let secondSeed: DemoSeedSummary;
const provider = new WikidataSnapshotProvider();

async function itemIdBy(provider: string, idType: string, value: string, dataset: 'demo' | 'live' = 'demo') {
  const [row] = await database.db
    .select({ id: catalogExternalIds.catalogItemId })
    .from(catalogExternalIds)
    .where(
      and(
        eq(catalogExternalIds.dataset, dataset),
        eq(catalogExternalIds.provider, provider),
        eq(catalogExternalIds.idType, idType),
        eq(catalogExternalIds.externalId, value),
      ),
    );
  return row?.id;
}

async function profile(userId: string, itemId: string) {
  const [row] = await database.db
    .select()
    .from(userItemProfiles)
    .where(and(eq(userItemProfiles.userId, userId), eq(userItemProfiles.catalogItemId, itemId)));
  return row;
}

/** Registro con un adapter envuelto para simular cambios de la fuente durante el test. */
function registryWith(source: string, wrap: (adapter: ProfileSourceAdapter) => ProfileSourceAdapter): AdapterRegistry {
  const base = createAdapterRegistry({ demoMode: true });
  return { ...base, get: (key) => (key === source ? wrap(base.get(key)!) : base.get(key)) };
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 6 });
  await truncateAll(database.db);
  firstSeed = await seedDemo(database);
  secondSeed = await seedDemo(database);
});

afterAll(async () => {
  await database?.close();
});

describe('seed de demo y sync idempotente', () => {
  it('importa el catálogo real completo y sincroniza las fuentes simuladas', () => {
    expect(firstSeed.catalog.total).toBeGreaterThan(100);
    expect(firstSeed.catalog.created).toBe(firstSeed.catalog.total);
    expect(firstSeed.syncs.length).toBe(14);
    expect(firstSeed.syncs.reduce((s, x) => s + x.observationsInserted, 0)).toBeGreaterThan(70);
  });

  it('repetir el seed y los syncs no duplica ni modifica nada', async () => {
    expect(secondSeed.catalog.created).toBe(0);
    expect(secondSeed.syncs.every((s) => s.observationsInserted === 0 && s.observationsUpdated === 0)).toBe(true);
    const connections = await database.db.select().from(userConnections);
    expect(connections).toHaveLength(14);
  });

  it('un registro inválido queda como error parcial sin detener el resto', () => {
    const screen = firstSeed.syncs.find((s) => s.handle === 'demo_laura' && s.source === 'fixture_screen')!;
    expect(screen.status).toBe('partial');
    expect(screen.partialErrors).toHaveLength(1);
    expect(screen.partialErrors[0]).toMatchObject({ code: 'invalid_record', sourceRecordId: 'scr-l-10' });
    expect(screen.observationsInserted).toBe(9);
  });
});

describe('modelo Known / Consumed / Preference', () => {
  it('un objeto presente en tres fuentes es una única entidad y un único perfil', async () => {
    const casablanca = await itemIdBy('imdb', 'title', 'tt0034583');
    expect(await itemIdBy('tmdb', 'movie', '289')).toBe(casablanca);
    expect(await itemIdBy('freebase', 'mid', '/m/0ft18')).toBe(casablanca);
    const p = await profile(LAURA, casablanca!);
    expect(p).toMatchObject({ sourceCount: 3, evidenceCount: 4, preferenceBasis: 'explicit_rating', knownConfidence: 1 });
    expect(p!.preferenceScore).toBeCloseTo(0.7778, 4);
    // El like de la tercera fuente no suma: queda anotado como evidencia de menor prioridad.
    expect((p!.notes as { overridden: unknown[] }).overridden).toHaveLength(1);
    const items = await database.db.select().from(catalogItems).where(eq(catalogItems.title, 'Casablanca'));
    expect(items).toHaveLength(1);
  });

  it('juego comprado con cero horas: conocido, no consumido, preferencia NULL', async () => {
    const mindustry = await itemIdBy('steam', 'app', '1127400');
    expect(await profile(LAURA, mindustry!)).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null, preferenceBasis: null });
  });

  it('watchlist y visto sin valoración no generan gusto', async () => {
    const strangelove = await itemIdBy('imdb', 'title', 'tt0057012');
    const someLikeItHot = await itemIdBy('imdb', 'title', 'tt0053291');
    expect(await profile(LAURA, strangelove!)).toMatchObject({ consumedConfidence: 0, preferenceScore: null });
    expect(await profile(LAURA, someLikeItHot!)).toMatchObject({ consumedConfidence: 1, preferenceScore: null });
  });

  it('una valoración negativa explícita prevalece sobre la asistencia inferida', async () => {
    const macba = await itemIdBy('wikidata', 'entity', 'Q1067140');
    const p = await profile(LAURA, macba!);
    expect(p).toMatchObject({ preferenceScore: -0.5, preferenceBasis: 'explicit_rating', consumedConfidence: 1 });
  });

  it('el ISBN de una edición atribuye la evidencia a la obra, sin confundir ediciones con libros distintos', async () => {
    const edition = await itemIdBy('isbn', 'isbn13', '9788420676340');
    const work = await itemIdBy('wikidata', 'entity', 'Q170583');
    const [editionRow] = await database.db.select().from(catalogItems).where(eq(catalogItems.id, edition!));
    expect(editionRow).toMatchObject({ itemType: 'book_edition', parentItemId: work });
    expect(await profile(LAURA, work!)).toMatchObject({ preferenceScore: 1 });
    expect(await profile(LAURA, edition!)).toBeUndefined();
  });

  it('resuelve por atributos exactos (título + año + autor) cuando no hay identificadores', async () => {
    const regenta = await itemIdBy('wikidata', 'entity', 'Q1784466');
    const [obs] = await database.db
      .select()
      .from(userItemObservations)
      .where(and(eq(userItemObservations.userId, LAURA), eq(userItemObservations.catalogItemId, regenta!)));
    expect(obs).toMatchObject({ timestampPrecision: 'year', consumedConfidence: 1, preferenceScore: null });
  });

  it('los IDs numéricos de películas y series no se confunden', async () => {
    const breakingBad = await itemIdBy('tmdb', 'tv', '1396');
    expect(breakingBad).toBeDefined();
    expect(await itemIdBy('tmdb', 'movie', '1396')).toBeUndefined();
  });

  it('un objeto desconocido para el catálogo se crea desde la fuente y usa imagen de sustitución', async () => {
    const portal = await itemIdBy('steam', 'app', '400');
    const [item] = await database.db.select().from(catalogItems).where(eq(catalogItems.id, portal!));
    expect(item).toMatchObject({ title: 'Portal', category: 'games', createdVia: 'source:fixture_play' });
    expect(await database.db.select().from(catalogImages).where(eq(catalogImages.catalogItemId, portal!))).toHaveLength(0);
  });

  it('una escucha aislada no genera preferencia; los episodios se agregan por programa', async () => {
    const serrat = await itemIdBy('musicbrainz', 'artist', '64e96700-d880-452e-803d-e4d7628b0224');
    expect(await profile(LAURA, serrat!)).toMatchObject({ consumedConfidence: 1, preferenceScore: null });
    const serial = await itemIdBy('apple_podcasts', 'podcast', '917918570');
    const episodes = await database.db
      .select()
      .from(userItemObservations)
      .where(and(eq(userItemObservations.userId, '00000000-0000-4000-a000-000000000005'), eq(userItemObservations.catalogItemId, serial!)));
    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.engagement).toEqual({ type: 'listened', value: 5, unit: 'episodes' });
  });

  it('las fechas de actividad son las de la fuente, no la de sincronización', async () => {
    const casablanca = await itemIdBy('imdb', 'title', 'tt0034583');
    const p = await profile(LAURA, casablanca!);
    expect(p!.firstSeenAt?.toISOString()).toBe('2024-11-20T00:00:00.000Z');
    expect(p!.lastSeenAt?.toISOString()).toBe('2026-03-16T09:12:00.000Z');
  });
});

describe('instantáneas, desconexión y borrado', () => {
  it('en una instantánea completa, lo que ya no aparece deja de ser evidencia vigente', async () => {
    const connection = (await findOpenConnection(database.db, ALEX, 'fixture_play'))!;
    const registry = registryWith('fixture_play', (adapter) => ({
      ...adapter,
      sync: async (ctx) => {
        const batch = await adapter.sync(ctx);
        return { ...batch, records: batch.records.filter((r) => (r as { appid: number }).appid !== 730) };
      },
    }));
    const runId = await createSyncRun(database, connection.id, 'user', 'full');
    const outcome = await runConnectionSync({ database, registry, resolver: new EntityResolver(database.db, [provider]) }, runId);
    expect(outcome).toMatchObject({ status: 'succeeded', observationsDeleted: 1 });
    const cs2 = await itemIdBy('steam', 'app', '730');
    expect(await profile(ALEX, cs2!)).toBeUndefined();
  });

  it('desconectar sin borrar conserva la evidencia; un sync tardío ya no escribe', async () => {
    const connection = (await findOpenConnection(database.db, JORDI, 'fixture_diary'))!;
    const registry = createAdapterRegistry({ demoMode: true });
    const pendingRun = await createSyncRun(database, connection.id, 'user', 'full');
    await disconnectSource(database.db, registry, JORDI, connection.id, { purge: false });

    const [revoked] = await database.db.select().from(userConnections).where(eq(userConnections.id, connection.id));
    expect(revoked).toMatchObject({ status: 'revoked', syncCursor: null });
    const [consent] = await database.db.select().from(providerConsents).where(eq(providerConsents.id, revoked!.consentId!));
    expect(consent!.revokedAt).not.toBeNull();
    const [run] = await database.db.select().from(sourceSyncRuns).where(eq(sourceSyncRuns.id, pendingRun));
    expect(run!.status).toBe('cancelled');

    const before = await database.db.select().from(userItemObservations).where(eq(userItemObservations.connectionId, connection.id));
    expect(before).toHaveLength(2);
    const lateRun = await createSyncRun(database, connection.id, 'user', 'full');
    const outcome = await runConnectionSync({ database, registry, resolver: new EntityResolver(database.db, [provider]) }, lateRun);
    expect(outcome.status).toBe('cancelled');
  });

  it('una desconexión durante el sync impide escribir el resto de páginas', async () => {
    const connection = (await findOpenConnection(database.db, LAURA, 'fixture_activity'))!;
    let calls = 0;
    const registry = registryWith('fixture_activity', (adapter) => ({
      ...adapter,
      sync: async (ctx) => {
        calls += 1;
        if (calls === 2) {
          await database.db
            .update(userConnections)
            .set({ status: 'revoked', revokedAt: new Date() })
            .where(eq(userConnections.id, connection.id));
        }
        return adapter.sync(ctx);
      },
    }));
    const runId = await createSyncRun(database, connection.id, 'user', 'full');
    const outcome = await runConnectionSync({ database, registry, resolver: new EntityResolver(database.db, [provider]), pageSize: 3 }, runId);
    expect(outcome.status).toBe('cancelled');
    expect(calls).toBe(2);
    // Restaurar para los tests siguientes.
    await database.db.update(userConnections).set({ status: 'active', revokedAt: null }).where(eq(userConnections.id, connection.id));
  });

  it('desconectar y borrar elimina lo importado de esa fuente y recalcula los perfiles con el resto', async () => {
    const connection = (await findOpenConnection(database.db, LAURA, 'fixture_activity'))!;
    const casablanca = await itemIdBy('imdb', 'title', 'tt0034583');
    const macba = await itemIdBy('wikidata', 'entity', 'Q1067140');
    const result = await disconnectSource(database.db, createAdapterRegistry({ demoMode: true }), LAURA, connection.id, { purge: true });
    expect(result.purgedObservations).toBe(8);
    expect(await profile(LAURA, macba!)).toBeUndefined();
    const p = await profile(LAURA, casablanca!);
    expect(p).toMatchObject({ sourceCount: 2, evidenceCount: 3 });
    expect((p!.notes as { overridden: unknown[] }).overridden).toHaveLength(0);
    // La evidencia de otros usuarios no se toca.
    expect(await profile(JORDI, casablanca!)).toBeDefined();
  });

  it('una persona no puede desconectar conexiones ajenas', async () => {
    const connection = (await findOpenConnection(database.db, ALEX, 'fixture_audio'))!;
    await expect(
      disconnectSource(database.db, createAdapterRegistry({ demoMode: true }), LAURA, connection.id, { purge: true }),
    ).rejects.toThrow(/no encontrada/);
    expect((await findOpenConnection(database.db, ALEX, 'fixture_audio'))?.status).toBe('active');
  });
});

describe('separación entre demo y datos reales', () => {
  it('un usuario real no puede conectar fuentes simuladas', async () => {
    await database.db.insert(users).values({ id: LIVE_USER, handle: 'live_tester', dataset: 'live' });
    await database.db.insert(userProfiles).values({ userId: LIVE_USER, displayName: 'Live' });
    await database.db.insert(userSettings).values({ userId: LIVE_USER });
    await expect(connectSource(database.db, createAdapterRegistry({ demoMode: true }), LIVE_USER, 'fixture_screen')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('la resolución en el dataset real nunca reutiliza objetos de la demo', async () => {
    const resolver = new EntityResolver(database.db, []);
    const result = await resolver.resolve(
      { category: 'movies', itemType: 'movie', title: 'Casablanca', sourceKey: 'tmdb', sourceId: 'movie:289', canonicalIds: { 'imdb:title': 'tt0034583' } },
      'live',
    );
    expect(result.method).toBe('created_from_source');
    expect(result.itemId).not.toBe(await itemIdBy('imdb', 'title', 'tt0034583', 'demo'));
    expect(await itemIdBy('imdb', 'title', 'tt0034583', 'live')).toBe(result.itemId);
  });

  it('un título parecido no basta para fusionar objetos', async () => {
    const resolver = new EntityResolver(database.db, [provider]);
    const result = await resolver.resolve(
      { category: 'movies', itemType: 'movie', title: 'Casablanca (remastered)', sourceKey: 'fixture_screen', sourceId: 'movie:999999', attributes: { releaseYear: 1942 } },
      'demo',
    );
    expect(result.method).toBe('created_from_source');
    expect(result.itemId).not.toBe(await itemIdBy('imdb', 'title', 'tt0034583'));
  });
});

describe('adapters fixture contra el pipeline', () => {
  it('el adapter de juegos declara sus tipos de instantánea', () => {
    expect(createFixtureAdapter('fixture_play').snapshotObservationKinds).toEqual(['library']);
  });
});
