import {
  catalogItems,
  catalogRelations,
  createDatabase,
  homeDismissals,
  recommendationImpressions,
  userAffinities,
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
import {
  NotFoundError,
  applyHomeAction,
  createOrResetLocalUser,
  recomputeAffinities,
  recommendFor,
  recordImpression,
  topSoulmates,
  undoLastHomeAction,
} from '../src/index.js';

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
/** `secondSource`: la misma persona vuelve a valorar el objeto desde otra fuente (su perfil ya existe). */
async function vote(userId: string, key: string, score: number, occurredAt: string, secondSource = false) {
  if (!secondSource) await like(userId, key, score);
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
  // Un artista con carrera antigua: sin regla de estreno, participa por las valoraciones de este año (§10).
  await item('artistaAntiguo', 'music', { itemType: 'artist', releaseDate: '1970-01-01', releaseDatePrecision: 'year' });

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
    await vote(voter, 'artistaAntiguo', 1, '2026-03-01T12:00:00Z');
    // El mismo voto desde una segunda fuente no cuenta dos veces.
    if (v === 0) await vote(voter, 'trending', 1, '2026-05-11T12:00:00Z', true);
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
    // Las personas 51 y 52 no cuentan para el consenso. Su objeto solo puede salir como respaldo de comunidad, con ese
    // motivo (2 personas de APPINITY), nunca como «tus almas gemelas».
    expect(byItem.get(items.persona51!)?.block ?? 'community').toBe('community');
    const primaryOnly = await recommendFor(database.db, viewer, { now: NOW, limit: 100, includeFallbacks: false });
    expect(primaryOnly.items.map((r) => r.itemId)).not.toContain(items.persona51);
  });

  it('desglose del consenso: solo agregados (apoyo, gusto, confianza, afinidad media y excepcionales)', async () => {
    const result = await recommendFor(database.db, viewer, { now: NOW });
    const found = result.items.find((r) => r.itemId === items.consenso)!;
    const top = await topSoulmates(database.db, viewer);
    const backers = top.filter((t) => [soulmates[0], soulmates[1], soulmates[2]].includes(t.userId));
    expect(backers).toHaveLength(3);
    expect(found.evidence).toEqual({
      score: expect.any(Number),
      support: Math.round((3 / found.consensus!.opinionated) * 100),
      likeLevel: 100,
      confidence: 100,
      supporterAffinity: Math.round(backers.reduce((a, b) => a + b.score, 0) / 3),
      exceptionalSupporters: backers.filter((b) => b.exceptionalMutual).length,
    });
    // Nunca se exponen quiénes lo apoyan.
    expect(JSON.stringify(found.evidence)).not.toContain(soulmates[0]!);
  });

  it('descubrimiento: identifica a la persona que lo aporta', async () => {
    const result = await recommendFor(database.db, viewer, { now: NOW });
    const found = result.items.find((r) => r.itemId === items.descubierto);
    expect(found).toMatchObject({ block: 'discovery', discovery: { contributorId: soulmates[0], contributorName: 'test_rec_alma_00' } });
    expect(found?.evidence).toMatchObject({ supporterAffinity: Math.round(found!.discovery!.contributorAffinity), exceptionalSupporters: expect.any(Number) });
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
    expect(trendingIds).toEqual(expect.arrayContaining([items.trending, items.estreno2026, items.artistaAntiguo]));
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

describe('Home: acciones e impresiones (fase 8)', () => {
  it('descartar quita la tarjeta de Home; deshacer la devuelve; conservar no la filtra en la siguiente sesión', async () => {
    await database.db.delete(homeDismissals);
    const ids = async () => (await recommendFor(database.db, viewer, { now: NOW, limit: 100 })).items.map((r) => r.itemId);
    expect(await ids()).toContain(items.consenso);
    await applyHomeAction(database.db, viewer, items.consenso!, 'dismiss');
    expect(await ids()).not.toContain(items.consenso);
    expect(await undoLastHomeAction(database.db, viewer)).toEqual({ itemId: items.consenso, action: 'dismiss' });
    expect(await ids()).toContain(items.consenso);
    await applyHomeAction(database.db, viewer, items.cerca!, 'keep');
    expect(await ids()).toContain(items.cerca);
    // Deshacer revierte solo la última acción vigente; después ya no queda nada.
    expect(await undoLastHomeAction(database.db, viewer)).toEqual({ itemId: items.cerca, action: 'keep' });
    expect(await undoLastHomeAction(database.db, viewer)).toBeNull();
  });

  it('NEW = primera impresión efectiva; deshacer no borra impresiones', async () => {
    await database.db.delete(recommendationImpressions);
    const before = await recommendFor(database.db, viewer, { now: NOW, limit: 100 });
    expect(before.items.find((r) => r.itemId === items.consenso)!.isNew).toBe(true);
    expect(await recordImpression(database.db, viewer, items.consenso!)).toEqual({ isNew: true });
    expect(await recordImpression(database.db, viewer, items.consenso!)).toEqual({ isNew: false });
    await applyHomeAction(database.db, viewer, items.consenso!, 'keep');
    await undoLastHomeAction(database.db, viewer);
    const after = await recommendFor(database.db, viewer, { now: NOW, limit: 100 });
    expect(after.items.find((r) => r.itemId === items.consenso)!.isNew).toBe(false);
  });

  it('ninguna acción de Home cambia gustos ni afinidades', async () => {
    const profiles = await database.db.select().from(userItemProfiles).where(eq(userItemProfiles.userId, viewer));
    const affinities = await database.db.select().from(userAffinities).where(eq(userAffinities.sourceUserId, viewer));
    for (const key of ['consenso', 'cerca', 'descubierto']) {
      await recordImpression(database.db, viewer, items[key]!);
      await applyHomeAction(database.db, viewer, items[key]!, 'dismiss');
      await applyHomeAction(database.db, viewer, items[key]!, 'keep');
    }
    await undoLastHomeAction(database.db, viewer);
    expect(await database.db.select().from(userItemProfiles).where(eq(userItemProfiles.userId, viewer))).toEqual(profiles);
    expect(await database.db.select().from(userAffinities).where(eq(userAffinities.sourceUserId, viewer))).toEqual(affinities);
  });

  it('no se puede actuar sobre objetos de otro dataset ni inexistentes', async () => {
    const [demoItem] = await database.db
      .insert(catalogItems)
      .values({ dataset: 'demo', category: 'movies', itemType: 'movie', title: 'Objeto de la demo', normalizedTitle: 'objeto de la demo', createdVia: 'test' })
      .returning({ id: catalogItems.id });
    await expect(applyHomeAction(database.db, viewer, demoItem!.id, 'dismiss')).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordImpression(database.db, viewer, '10000000-0000-4000-a000-00000000dead')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('feed continuo: respaldos honestos (fase 9)', () => {
  it('cuando se agotan los bloques principales siguen comunidad, conservados y explorar, cada uno con su motivo', async () => {
    await database.db.delete(homeDismissals);
    await item('sinSenales', 'movies');
    await item('conservado', 'books');
    await applyHomeAction(database.db, viewer, items.conservado!, 'keep');
    const all = await recommendFor(database.db, viewer, { now: NOW, limit: 50 });
    const blocks = all.items.map((r) => r.block);
    // Primero los bloques principales; después, los respaldos en orden.
    const firstFallback = blocks.findIndex((b) => ['community', 'kept', 'explore'].includes(b));
    expect(firstFallback).toBeGreaterThan(0);
    expect(blocks.slice(firstFallback).every((b) => ['community', 'kept', 'explore'].includes(b))).toBe(true);
    const byItem = new Map(all.items.map((r) => [r.itemId, r]));
    expect(byItem.get(items.persona51!)).toMatchObject({ block: 'community', community: { supporters: 2 } });
    expect(byItem.get(items.conservado!)?.block).toBe('kept');
    expect(byItem.get(items.sinSenales!)?.block).toBe('explore');
    // Los filtros siguen valiendo: lo conocido y los lugares fuera del radio tampoco salen como respaldo.
    expect(byItem.has(items.conocido!)).toBe(false);
    expect(byItem.has(items.lejos!)).toBe(false);
    expect(all.available.explore).toBeGreaterThan(0);
    // «Para explorar» solo incluye objetos que nadie ha valorado: «votado2025» (valorado por vecinos) no sale así.
    expect(byItem.get(items.votado2025!)?.block).not.toBe('explore');
  });

  it('el orden de explorar es estable en el día y cambia de un día a otro', async () => {
    const explore = async (now: Date) =>
      (await recommendFor(database.db, viewer, { now, limit: 50 })).items.filter((r) => r.block === 'explore').map((r) => r.itemId);
    expect(await explore(NOW)).toEqual(await explore(new Date(NOW.getTime() + 3_600_000)));
    expect(new Set(await explore(new Date('2026-10-15T10:00:00Z')))).toEqual(new Set(await explore(NOW)));
  });

  it('Categories: solo la categoría pedida, sin aplicar los descartes de Home', async () => {
    await applyHomeAction(database.db, viewer, items.cerca!, 'dismiss');
    const food = await recommendFor(database.db, viewer, { now: NOW, limit: 50, category: 'food', applyHomeDismissals: false });
    expect(food.items.length).toBeGreaterThan(0);
    expect(food.items.map((r) => r.itemId)).toContain(items.cerca);
    const metaRows = await database.db.select({ id: catalogItems.id, category: catalogItems.category }).from(catalogItems);
    const categoryOf = new Map(metaRows.map((m) => [m.id, m.category]));
    expect(food.items.every((r) => categoryOf.get(r.itemId) === 'food')).toBe(true);
    // En Home, el descarte sí se aplica.
    expect((await recommendFor(database.db, viewer, { now: NOW, limit: 50, category: 'food' })).items.map((r) => r.itemId)).not.toContain(items.cerca);
  });
});

describe('por contenido: arranque en frío sin almas gemelas', () => {
  it('«porque te gusta X»: relacionado con un gusto, sin lo ya conocido ni lo relacionado con un disgusto', async () => {
    await item('relacionado', 'movies');
    await item('deDisgusto', 'movies');
    await item('odiada', 'movies');
    const solo = await person('test_rec_solitario', null);
    await like(solo, 'base0', 1);
    await like(solo, 'odiada', -1);
    await like(solo, 'conocido', 0, 0.9, 0.9);
    await database.db.insert(catalogRelations).values([
      { sourceItemId: items.base0!, targetItemId: items.relacionado!, relation: 'same_director', weight: 0.8, version: 'test' },
      { sourceItemId: items.base0!, targetItemId: items.conocido!, relation: 'same_series', weight: 1, version: 'test' },
      { sourceItemId: items.odiada!, targetItemId: items.deDisgusto!, relation: 'same_series', weight: 1, version: 'test' },
    ]);
    const result = await recommendFor(database.db, solo, { now: NOW, limit: 200 });
    const content = result.items.filter((r) => r.block === 'content');
    expect(content).toEqual([expect.objectContaining({ itemId: items.relacionado, content: { becauseItemId: items.base0, becauseTitle: 'Sintético base0', relation: 'same_director' } })]);
    const ids = result.items.map((r) => r.itemId);
    // Lo relacionado con un disgusto no sale «por contenido» (puede salir en explorar, sin señales); lo conocido, nunca.
    expect(result.items.find((r) => r.itemId === items.deDisgusto)?.block).not.toBe('content');
    expect(ids).not.toContain(items.conocido);
    // El bloque por contenido va antes que comunidad y explorar.
    expect(ids.indexOf(items.relacionado!)).toBeLessThan(result.items.findIndex((r) => r.block === 'explore'));
  });
});
