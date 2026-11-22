import {
  catalogItems,
  createDatabase,
  homeDismissals,
  userConnections,
  userItemObservations,
  userItemProfiles,
  userSettings,
  type DatabaseHandle,
} from '@appinity/database';
import type { Category } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createOrResetLocalUser, recomputeAffinities, recommendFor, topSoulmates } from '../src/index.js';

/**
 * Datos SINTÉTICOS (dataset live, handles «test_rec_*»). Una persona destinataria en Barcelona, 52 personas con gustos
 * parecidos en distinto grado (para que haya Top 50 y personas 51 y 52) y votantes de Trending dentro y fuera de la zona.
 */
let database: DatabaseHandle;
const NOW = new Date('2026-10-14T10:00:00Z');
const BCN = { latitude: 41.39, longitude: 2.17 };
const GIRONA = { latitude: 41.98, longitude: 2.82 };
let viewer = '';
const soulmates: string[] = [];
const items: Record<string, string> = {};
let seq = 0;

async function item(key: string, category: Category, extra: Partial<typeof catalogItems.$inferInsert> = {}) {
  const [row] = await database.db
    .insert(catalogItems)
    .values({ dataset: 'live', category, itemType: category === 'food' ? 'restaurant' : 'movie', title: `Sintético ${key}`, normalizedTitle: `sintetico ${key}`, createdVia: 'test', ...extra })
    .returning({ id: catalogItems.id });
  items[key] = row!.id;
}

async function person(handle: string, where: { latitude: number; longitude: number } | null) {
  const { userId } = await createOrResetLocalUser(database.db, { handle, displayName: handle });
  if (where) {
    await database.db
      .update(userSettings)
      .set({ locationLatitude: where.latitude, locationLongitude: where.longitude, locationSource: 'manual', locationLabel: 'Zona sintética' })
      .where(eq(userSettings.userId, userId));
  }
  return userId;
}

async function like(userId: string, key: string, score: number, confidence = 1, known = 1) {
  await database.db.insert(userItemProfiles).values({
    userId,
    catalogItemId: items[key]!,
    knownConfidence: known,
    consumedConfidence: known,
    preferenceScore: score,
    preferenceConfidence: confidence,
    preferenceBasis: 'explicit_rating',
    evidenceCount: 1,
    sourceCount: 1,
    consolidationVersion: 'test',
  });
}

/** Voto de Trending: perfil + observación explícita con su fecha real (occurred_at) y una fecha de sync distinta. */
async function vote(userId: string, key: string, score: number, occurredAt: string) {
  await like(userId, key, score);
  const [connection] = await database.db
    .insert(userConnections)
    .values({ userId, sourceKey: `test_${++seq}`, status: 'active' })
    .returning({ id: userConnections.id });
  await database.db.insert(userItemObservations).values({
    userId,
    catalogItemId: items[key]!,
    connectionId: connection!.id,
    sourceKey: 'test',
    sourceRecordId: `${key}-${seq}`,
    observationKind: 'review',
    mapperVersion: 'test',
    knownConfidence: 1,
    consumedConfidence: 1,
    preferenceScore: score,
    preferenceConfidence: 1,
    preferenceBasis: 'explicit_rating',
    occurredAt: new Date(occurredAt),
    timestampPrecision: 'instant',
    contentHash: `h${seq}`,
    syncedAt: NOW, // sincronizado hoy: no debe usarse como fecha del voto
  });
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  for (let i = 0; i < 6; i++) await item(`base${i}`, 'movies');
  for (const key of ['consenso', 'persona51', 'descubierto', 'conocido', 'descartado']) await item(key, 'movies');
  await item('cerca', 'food', BCN);
  await item('lejos', 'food', GIRONA);
  await item('trending', 'food', { latitude: 41.392, longitude: 2.172 });
  await item('votado2025', 'food', { latitude: 41.393, longitude: 2.171 });
  await item('votosFuera', 'food', { latitude: 41.391, longitude: 2.173 });
  await item('estreno2026', 'movies', { releaseDate: '2026-03-01', releaseDatePrecision: 'day' });
  await item('clasico', 'movies', { releaseDate: '1942-11-26', releaseDatePrecision: 'day' });

  viewer = await person('test_rec_destino', BCN);
  for (let i = 0; i < 6; i++) await like(viewer, `base${i}`, 1);
  await like(viewer, 'conocido', 0, 0.9, 0.9); // lo conoce (sin opinión fuerte): no se le recomienda

  // 52 personas: la i-ésima coincide algo menos que la anterior, así que el orden del ranking es conocido.
  for (let i = 0; i < 52; i++) {
    const id = await person(`test_rec_alma_${String(i).padStart(2, '0')}`, BCN);
    soulmates.push(id);
    for (let b = 0; b < 6; b++) await like(id, `base${b}`, Math.round((1 - i * 0.03) * 100) / 100);
  }
  for (const i of [0, 1, 2]) await like(soulmates[i]!, 'consenso', 1);
  for (const i of [0, 1]) await like(soulmates[i]!, 'cerca', 1);
  for (const i of [0, 1]) await like(soulmates[i]!, 'lejos', 1);
  for (const i of [0, 1, 2]) await like(soulmates[i]!, 'conocido', 1);
  for (const i of [0, 1, 2]) await like(soulmates[i]!, 'descartado', 1);
  await like(soulmates[0]!, 'descubierto', 1);
  // Las personas 51 y 52 del ranking apoyan un objeto que nadie del Top 50 conoce.
  for (const i of [50, 51]) await like(soulmates[i]!, 'persona51', 1);

  // Trending: 6 votantes de la zona este año; votos del año pasado; votos de fuera de la zona.
  for (let v = 0; v < 6; v++) {
    const voter = await person(`test_rec_vecino_${v}`, BCN);
    await vote(voter, 'trending', 1, '2026-05-10T12:00:00Z');
    await vote(voter, 'votado2025', 1, '2025-06-01T12:00:00Z');
    await vote(voter, 'estreno2026', 1, '2026-04-01T12:00:00Z');
    await vote(voter, 'clasico', 1, '2026-04-01T12:00:00Z');
    const far = await person(`test_rec_lejano_${v}`, GIRONA);
    await vote(far, 'votosFuera', 1, '2026-05-10T12:00:00Z');
  }
  await recomputeAffinities(database.db);
});

afterAll(async () => {
  await database?.close();
});

describe('recomendador (fase 7)', () => {
  it('el ranking tiene más de 50 personas y las dos últimas quedan fuera del Top 50', async () => {
    const top = await topSoulmates(database.db, viewer);
    expect(top).toHaveLength(50);
    expect(top.map((t) => t.userId)).not.toContain(soulmates[50]);
    expect(top.map((t) => t.userId)).not.toContain(soulmates[51]);
  });

  it('consenso del Top 50: la persona 51 no influye y se cuentan apoyos únicos', async () => {
    const result = await recommendFor(database.db, viewer, { now: NOW });
    const byItem = new Map(result.items.map((r) => [r.itemId, r]));
    expect(byItem.get(items.consenso!)).toMatchObject({ block: 'consensus', consensus: { supporters: 3 } });
    expect(byItem.has(items.persona51!)).toBe(false);
  });

  it('descubrimiento: identifica a la persona que lo aporta', async () => {
    const result = await recommendFor(database.db, viewer, { now: NOW });
    const found = result.items.find((r) => r.itemId === items.descubierto);
    expect(found).toMatchObject({ block: 'discovery', discovery: { contributorId: soulmates[0], contributorName: 'test_rec_alma_00' } });
  });

  it('excluye conocidos, lugares fuera del radio y descartes de Home; descartar no cambia los gustos', async () => {
    const before = await database.db.select().from(userItemProfiles).where(eq(userItemProfiles.userId, viewer));
    await database.db.insert(homeDismissals).values({ userId: viewer, catalogItemId: items.descartado! });
    const home = await recommendFor(database.db, viewer, { now: NOW });
    const ids = home.items.map((r) => r.itemId);
    expect(ids).not.toContain(items.conocido);
    expect(ids).not.toContain(items.lejos);
    expect(ids).toContain(items.cerca);
    expect(ids).not.toContain(items.descartado);
    // Categories (fase 9) no aplica el descarte de Home.
    expect((await recommendFor(database.db, viewer, { now: NOW, applyHomeDismissals: false })).items.map((r) => r.itemId)).toContain(items.descartado);
    expect(await database.db.select().from(userItemProfiles).where(eq(userItemProfiles.userId, viewer))).toEqual(before);
    // Lo ya mostrado en la sesión no se repite.
    expect((await recommendFor(database.db, viewer, { now: NOW, excludeItemIds: [items.cerca!] })).items.map((r) => r.itemId)).not.toContain(items.cerca);
  });

  it('Trending: votos de la zona fechados este año (no el sync), con estreno de este año para las obras', async () => {
    const result = await recommendFor(database.db, viewer, { now: NOW });
    expect(result.trending).toMatchObject({ status: 'ok', year: 2026, radiusKm: 10, minVoters: 5 });
    const trending = result.items.filter((r) => r.block === 'trending' || r.trending).map((r) => r.itemId);
    const all = await recommendFor(database.db, viewer, { now: NOW, limit: 100 });
    const trendingIds = all.items.filter((r) => r.trending).map((r) => r.itemId);
    expect(trendingIds).toEqual(expect.arrayContaining([items.trending, items.estreno2026]));
    expect(trendingIds).not.toContain(items.votado2025); // votado en 2025 aunque se sincronizara hoy
    expect(trendingIds).not.toContain(items.votosFuera); // votantes fuera de la zona
    expect(trendingIds).not.toContain(items.clasico); // estrenada en 1942
    expect(trending.length).toBeGreaterThan(0);
    expect(all.items.find((r) => r.itemId === items.trending)!.trending).toMatchObject({ positiveVoters: 6, totalVoters: 6 });
  });

  it('al cambiar de año (según la zona horaria del usuario) los votos del año anterior dejan de contar', async () => {
    const nextYear = await recommendFor(database.db, viewer, { now: new Date('2026-12-31T23:30:00Z'), limit: 100 });
    // En Europe/Madrid ya es 2027.
    expect(nextYear.trending.year).toBe(2027);
    expect(nextYear.items.filter((r) => r.trending)).toEqual([]);
    expect(nextYear.trending.status).toBe('insufficient_votes');
  });

  it('sin ubicación no hay Trending local ni lugares (no se presume ninguna ciudad)', async () => {
    const lost = await person('test_rec_sin_zona', null);
    for (let i = 0; i < 6; i++) await like(lost, `base${i}`, 1);
    await recomputeAffinities(database.db, { userIds: [lost] });
    const result = await recommendFor(database.db, lost, { now: NOW, limit: 100 });
    expect(result).toMatchObject({ localFilter: 'no_location', trending: { status: 'no_location', radiusKm: null } });
    expect(result.items.map((r) => r.itemId)).not.toContain(items.cerca);
    expect(result.items.map((r) => r.itemId)).toContain(items.consenso);
  });
});
