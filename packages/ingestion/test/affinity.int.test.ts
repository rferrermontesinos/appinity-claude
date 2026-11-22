import { affinity, indexPreferences, type PreferencePoint } from '@appinity/algorithms';
import { catalogItems, categoryAffinities, createDatabase, userAffinities, userItemProfiles, users, type DatabaseHandle } from '@appinity/database';
import type { Category } from '@appinity/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { AFFINITY_VERSION, createOrResetLocalUser, recomputeAffinities, seedDemo } from '../src/index.js';

/**
 * Perfiles SINTÉTICOS en la base de datos de test (dataset live, handles «test_afin_*»). Ninguno deriva de una persona
 * real: cubren gustos muy afines, contrarios, categorías ausentes, historiales desiguales y usuarios no elegibles.
 */
let database: DatabaseHandle;
const ids: Record<string, string> = {};
const items = new Map<string, string>(); // clave sintética → id del catálogo

async function item(key: string, category: Category): Promise<string> {
  const existing = items.get(key);
  if (existing) return existing;
  const [row] = await database.db
    .insert(catalogItems)
    .values({ dataset: 'live', category, itemType: category === 'food' ? 'restaurant' : 'movie', title: `Sintético ${key}`, normalizedTitle: `sintetico ${key}`, createdVia: 'test' })
    .returning({ id: catalogItems.id });
  items.set(key, row!.id);
  return row!.id;
}

/** Preferencias de un usuario: [clave del objeto, categoría, puntuación, confianza]. */
async function prefer(user: string, prefs: Array<[string, Category, number, number?]>) {
  await database.db.delete(userItemProfiles).where(eq(userItemProfiles.userId, ids[user]!));
  for (const [key, category, score, confidence = 1] of prefs) {
    await database.db.insert(userItemProfiles).values({
      userId: ids[user]!,
      catalogItemId: await item(key, category),
      knownConfidence: 1,
      consumedConfidence: 1,
      preferenceScore: score,
      preferenceConfidence: confidence,
      preferenceBasis: 'explicit_rating',
      evidenceCount: 1,
      sourceCount: 1,
      consolidationVersion: 'test',
    });
  }
}

const range = (prefix: string, category: Category, n: number, score: (i: number) => number, from = 0) =>
  Array.from({ length: n }, (_, i) => [`${prefix}${i + from}`, category, score(i + from)] as [string, Category, number]);
/** Gustos polarizados (+1 / −1): su contrario es un desacuerdo total (un 0 neutro no lo sería). */
const varied = (i: number) => (i % 3 === 0 ? -1 : 1);

async function row(source: string, target: string) {
  const [r] = await database.db
    .select()
    .from(userAffinities)
    .where(and(eq(userAffinities.sourceUserId, ids[source]!), eq(userAffinities.targetUserId, ids[target]!)));
  return r;
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  for (const name of ['ana', 'bea', 'carla', 'dani', 'eva', 'fede', 'gus']) {
    ids[name] = (await createOrResetLocalUser(database.db, { handle: `test_afin_${name}`, displayName: `Sintético ${name}` })).userId;
  }
  // Ana: 12 películas con gustos variados y 6 restaurantes.
  await prefer('ana', [...range('m', 'movies', 12, varied), ...range('f', 'food', 6, () => 1)]);
  // Bea: mismas películas y mismo gusto → muy afín (no tiene restaurantes: categoría ausente).
  await prefer('bea', range('m', 'movies', 12, varied));
  // Carla: mismas películas con el gusto contrario → 0.
  await prefer('carla', range('m', 'movies', 12, (i) => -varied(i)));
  // Dani: solo restaurantes que Ana no conoce → sin nada en común (NULL).
  await prefer('dani', range('x', 'food', 5, () => 1));
  // Eva: historial enorme (60 películas), 12 en común con Ana con el mismo gusto → A → B ≠ B → A.
  await prefer('eva', range('m', 'movies', 60, varied));
  // Fede: solo 2 preferencias → no elegible (mínimo 3), aunque coincidan.
  await prefer('fede', range('m', 'movies', 2, varied));
  // Gus: suspendido → no elegible.
  await prefer('gus', range('m', 'movies', 12, varied));
  await database.db.update(users).set({ status: 'suspended' }).where(eq(users.id, ids.gus!));
});

afterAll(async () => {
  await database?.close();
});

describe('recálculo de afinidades', () => {
  it('calcula y guarda afinidades direccionales versionadas entre usuarios elegibles', async () => {
    const [live] = (await recomputeAffinities(database.db)).filter((r) => r.dataset === 'live');
    expect(live).toMatchObject({ eligibleUsers: 5 });
    const anaBea = await row('ana', 'bea');
    expect(anaBea).toMatchObject({ algorithmVersion: AFFINITY_VERSION, categoriesCompared: 1, commonItems: 12 });
    expect(anaBea!.score).toBeGreaterThan(80);
    // Desacuerdo total con evidencia suficiente: 0, no NULL.
    expect((await row('ana', 'carla'))!.score).toBe(0);
  });

  it('sin objetos en común no hay fila (NULL) y los no elegibles no aparecen', async () => {
    expect(await row('ana', 'dani')).toBeUndefined();
    expect(await row('ana', 'fede')).toBeUndefined();
    expect(await row('ana', 'gus')).toBeUndefined();
    expect(await row('gus', 'ana')).toBeUndefined();
  });

  it('con historiales desiguales solo cuentan los objetos en común: la afinidad es la misma en ambos sentidos', async () => {
    const anaEva = (await row('ana', 'eva'))!;
    const evaAna = (await row('eva', 'ana'))!;
    // Eva tiene 60 películas y Ana 12 (y restaurantes que Eva no conoce): solo cuentan las 12 en común.
    expect(anaEva.score).toBe(evaAna.score);
    expect((await row('ana', 'bea'))!.score).toBe(anaEva.score);
  });

  it('las categorías se guardan por separado; una categoría sin comparación no tiene fila', async () => {
    const rows = await database.db
      .select()
      .from(categoryAffinities)
      .where(and(eq(categoryAffinities.sourceUserId, ids.ana!), eq(categoryAffinities.targetUserId, ids.bea!)));
    expect(rows.map((r) => r.category)).toEqual(['movies']);
    expect(rows[0]).toMatchObject({ commonItems: 12, agreement: 1, coverage: 1 });
  });

  it('el prefiltro da exactamente lo mismo que el cálculo exhaustivo de todas las parejas', async () => {
    const eligible = ['ana', 'bea', 'carla', 'dani', 'eva'];
    const profiles = new Map<string, ReturnType<typeof indexPreferences>>();
    for (const name of eligible) {
      const prefs = await database.db
        .select({ itemId: userItemProfiles.catalogItemId, category: catalogItems.category, score: userItemProfiles.preferenceScore, confidence: userItemProfiles.preferenceConfidence })
        .from(userItemProfiles)
        .innerJoin(catalogItems, eq(catalogItems.id, userItemProfiles.catalogItemId))
        .where(eq(userItemProfiles.userId, ids[name]!));
      profiles.set(name, indexPreferences(prefs as PreferencePoint[]));
    }
    const exhaustive: string[] = [];
    for (const a of eligible) for (const b of eligible) if (a !== b && affinity(profiles.get(a)!, profiles.get(b)!).score !== null) exhaustive.push(`${a}>${b}`);
    const stored = await database.db.select({ s: userAffinities.sourceUserId, t: userAffinities.targetUserId }).from(userAffinities);
    const name = (id: string) => Object.entries(ids).find(([, v]) => v === id)![0];
    expect(stored.map((r) => `${name(r.s)}>${name(r.t)}`).sort()).toEqual(exhaustive.sort());
  });

  it('un recálculo parcial solo sustituye las parejas del usuario que cambió', async () => {
    const before = (await row('bea', 'carla'))!;
    // Bea pasa a tener el gusto contrario al de Ana.
    await prefer('bea', range('m', 'movies', 12, (i) => -varied(i)));
    const [live] = await recomputeAffinities(database.db, { userIds: [ids.bea!], now: new Date('2030-01-01T00:00:00Z') });
    expect(live).toMatchObject({ dataset: 'live', focusUsers: 1 });
    expect((await row('ana', 'bea'))!.score).toBe(0);
    expect((await row('bea', 'ana'))!.score).toBe(0);
    // Bea y Carla ahora coinciden.
    expect((await row('bea', 'carla'))!.score).toBeGreaterThan(80);
    expect(before.score).toBe(0);
    // Las parejas sin Bea no se tocaron.
    expect((await row('ana', 'carla'))!.computedAt.getFullYear()).not.toBe(2030);
  });

  it('la demo y las cuentas reales nunca se comparan entre sí', async () => {
    await seedDemo(database);
    await recomputeAffinities(database.db);
    const pairs = await database.db
      .select({ source: userAffinities.sourceUserId, target: userAffinities.targetUserId })
      .from(userAffinities);
    const datasets = new Map((await database.db.select({ id: users.id, dataset: users.dataset }).from(users)).map((u) => [u.id, u.dataset]));
    for (const p of pairs) expect(datasets.get(p.source)).toBe(datasets.get(p.target));
    expect(pairs.some((p) => datasets.get(p.source) === 'demo')).toBe(true);
  });
});
