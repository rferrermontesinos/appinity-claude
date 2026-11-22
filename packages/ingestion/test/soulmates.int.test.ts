import { affinity, indexPreferences, rarityWeight, type PreferenceIndex } from '@appinity/algorithms';
import { catalogItems, createDatabase, follows, friendships, userBlocks, userItemProfiles, userProfiles, users, type DatabaseHandle } from '@appinity/database';
import type { Category } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { FREE_SOULMATES_LIMIT, canSeePerson, createOrResetLocalUser, recomputeAffinities, topSoulmates } from '../src/index.js';

/**
 * Perfiles SINTÉTICOS deterministas (generador con semilla). Cuatro «gustos» de base con ruido, valoraciones en pasos de
 * 0,5, confianzas explícitas (1) o de conducta (0,6) y coberturas distintas. Ninguno deriva de una persona real.
 */
let database: DatabaseHandle;
const people: string[] = [];
const prefsByUser = new Map<string, Array<{ itemId: string; category: Category; score: number; confidence: number }>>();
const itemIds: Array<{ id: string; category: Category }> = [];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function createPeople(from: number, count: number) {
  for (let n = from; n < from + count; n++) {
    const { userId } = await createOrResetLocalUser(database.db, { handle: `test_alma_${String(n).padStart(3, '0')}`, displayName: `Sintética ${n}` });
    people.push(userId);
    const random = rng(1000 + n);
    const taste = n % 4; // grupo de gustos
    const prefs: Array<{ itemId: string; category: Category; score: number; confidence: number }> = [];
    itemIds.forEach((item, i) => {
      if (random() > 0.55) return; // cada persona conoce una parte distinta del catálogo
      const base = ((i + taste) % 4) - 1.5; // −1,5 … 1,5 según el grupo
      const score = Math.max(-1, Math.min(1, Math.round(((base / 1.5) + (random() - 0.5) * 0.6) * 2) / 2));
      prefs.push({ itemId: item.id, category: item.category, score, confidence: random() > 0.3 ? 1 : 0.6 });
    });
    for (const p of prefs) {
      await database.db.insert(userItemProfiles).values({
        userId,
        catalogItemId: p.itemId,
        knownConfidence: 1,
        consumedConfidence: 1,
        preferenceScore: p.score,
        preferenceConfidence: p.confidence,
        preferenceBasis: p.confidence === 1 ? 'explicit_rating' : 'strong_behavior',
        evidenceCount: 1,
        sourceCount: 1,
        consolidationVersion: 'test',
      });
    }
    prefsByUser.set(userId, prefs);
  }
}

/** Ranking esperado calculado de forma EXHAUSTIVA (todas las parejas) con el mismo motor y el mismo orden estable. */
function exhaustiveRanking(viewer: string, excluded: Set<string> = new Set()) {
  const index = (u: string): PreferenceIndex => indexPreferences(prefsByUser.get(u)!.length >= 3 ? prefsByUser.get(u)! : []);
  // affinity-v5: la misma rareza que el motor (personas comparables con preferencia sobre cada obra).
  const eligible = people.filter((p) => prefsByUser.get(p)!.length >= 3);
  const holders = new Map<string, number>();
  for (const p of eligible) for (const pref of prefsByUser.get(p)!) holders.set(pref.itemId, (holders.get(pref.itemId) ?? 0) + 1);
  const rarity = new Map([...holders].map(([id, n]) => [id, rarityWeight(n, eligible.length)]));
  return people
    .filter((p) => p !== viewer && !excluded.has(p) && prefsByUser.get(p)!.length >= 3)
    .map((p) => ({ userId: p, result: affinity(index(viewer), index(p), undefined, rarity) }))
    .filter((r) => r.result.score !== null)
    .sort(
      (a, b) =>
        b.result.score! - a.result.score! ||
        b.result.confidence - a.result.confidence ||
        b.result.commonItems - a.result.commonItems ||
        a.userId.localeCompare(b.userId),
    )
    .map((r) => r.userId);
}

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  const categories: Category[] = ['movies', 'movies', 'series', 'music', 'food'];
  for (let i = 0; i < 25; i++) {
    const category = categories[i % categories.length]!;
    const [row] = await database.db
      .insert(catalogItems)
      .values({ dataset: 'live', category, itemType: category === 'food' ? 'restaurant' : 'movie', title: `Objeto sintético ${i}`, normalizedTitle: `objeto sintetico ${i}`, createdVia: 'test' })
      .returning({ id: catalogItems.id });
    itemIds.push({ id: row!.id, category });
  }
});

afterAll(async () => {
  await database?.close();
});

describe('Top 50 con menos de 50 candidatas', () => {
  beforeAll(async () => {
    await createPeople(0, 12);
    await recomputeAffinities(database.db);
  });

  it('devuelve solo las que existen (sin rellenar), sin el propio usuario y en el orden del cálculo exhaustivo', async () => {
    const viewer = people[0]!;
    const ranking = await topSoulmates(database.db, viewer);
    expect(ranking.length).toBeLessThanOrEqual(11);
    expect(ranking.length).toBeGreaterThan(0);
    expect(ranking.map((r) => r.userId)).not.toContain(viewer);
    expect(ranking.map((r) => r.userId)).toEqual(exhaustiveRanking(viewer));
    expect(ranking.map((r) => r.rank)).toEqual(ranking.map((_, i) => i + 1));
    // Orden no creciente de afinidad.
    for (let i = 1; i < ranking.length; i++) expect(ranking[i]!.score).toBeLessThanOrEqual(ranking[i - 1]!.score);
  });

  it('el perfil mínimo no lleva historial: solo nombre, país, foto y cifras', async () => {
    const [first] = await topSoulmates(database.db, people[0]!);
    expect(Object.keys(first!).sort()).toEqual(['avatarUrl', 'categoriesCompared', 'confidence', 'countryCode', 'displayName', 'exceptionalMutual', 'rank', 'score', 'userId']);
  });

  it('excluye bloqueos en ambas direcciones y cuentas que dejan de ser elegibles', async () => {
    const viewer = people[0]!;
    const before = await topSoulmates(database.db, viewer);
    const [a, b, c] = before.map((r) => r.userId);
    await database.db.insert(userBlocks).values({ blockerUserId: viewer, blockedUserId: a! });
    await database.db.insert(userBlocks).values({ blockerUserId: b!, blockedUserId: viewer });
    await database.db.update(users).set({ status: 'suspended' }).where(eq(users.id, c!));
    const after = (await topSoulmates(database.db, viewer)).map((r) => r.userId);
    expect(after).not.toContain(a);
    expect(after).not.toContain(b);
    expect(after).not.toContain(c);
    expect(after).toEqual(exhaustiveRanking(viewer, new Set([a!, b!, c!])));
    // Quien bloquea tampoco aparece en el ranking de la otra persona, y el perfil queda inaccesible en ambos sentidos.
    expect((await topSoulmates(database.db, a!)).map((r) => r.userId)).not.toContain(viewer);
    expect(await canSeePerson(database.db, viewer, a!)).toBe(false);
    expect(await canSeePerson(database.db, b!, viewer)).toBe(false);
    expect(await canSeePerson(database.db, viewer, viewer)).toBe(false);
    // Deshacer para el siguiente bloque.
    await database.db.delete(userBlocks);
    await database.db.update(users).set({ status: 'active' }).where(eq(users.id, c!));
  });
});

describe('Top 50 con más de 50 candidatas', () => {
  beforeAll(async () => {
    await createPeople(12, 58); // 70 en total
    await recomputeAffinities(database.db);
  });

  it(`devuelve exactamente ${FREE_SOULMATES_LIMIT}, los primeros del cálculo exhaustivo (el prefiltro no pierde candidatas)`, async () => {
    for (const viewer of [people[0]!, people[37]!, people[69]!]) {
      const ranking = await topSoulmates(database.db, viewer);
      const expected = exhaustiveRanking(viewer);
      expect(expected.length).toBeGreaterThan(FREE_SOULMATES_LIMIT);
      expect(ranking).toHaveLength(FREE_SOULMATES_LIMIT);
      expect(ranking.map((r) => r.userId)).toEqual(expected.slice(0, FREE_SOULMATES_LIMIT));
    }
  });

  it('es estable: dos consultas seguidas devuelven el mismo orden', async () => {
    const viewer = people[5]!;
    expect(await topSoulmates(database.db, viewer)).toEqual(await topSoulmates(database.db, viewer));
  });
});

/**
 * Principio de producto (transparencia, 2026-10-27; «Cómo funciona APPINITY»): el ranking de personas solo lee gustos.
 * Nunca nombre, país, foto, seguidores, amistades ni nada que mida lo popular que es alguien.
 */
describe('El ranking de personas no usa popularidad ni datos personales', () => {
  it('cambiar el perfil de todas las candidatas y hacer «popular» a la última no mueve ni el orden ni las cifras', async () => {
    const viewer = people[7]!;
    await recomputeAffinities(database.db);
    const snapshot = async () => (await topSoulmates(database.db, viewer)).map((s) => ({ userId: s.userId, score: s.score, confidence: s.confidence }));
    const before = await snapshot();
    expect(before.length).toBeGreaterThan(3);
    const others = people.filter((p) => p !== viewer);
    const last = before[before.length - 1]!.userId;
    for (const [i, id] of others.entries()) {
      await database.db
        .update(userProfiles)
        .set({ displayName: `Cambiada ${i}`, countryCode: i % 2 ? 'FR' : 'JP', avatarUrl: `https://example.invalid/${i}.png` })
        .where(eq(userProfiles.userId, id));
    }
    // La última del ranking pasa a ser la más «popular»: la siguen todas y es amiga de todas.
    for (const id of others) {
      if (id === last) continue;
      await database.db.insert(follows).values({ followerUserId: id, followedUserId: last }).onConflictDoNothing();
      await database.db.insert(friendships).values({ requesterId: id, addresseeId: last, status: 'accepted', respondedAt: new Date() });
    }
    await recomputeAffinities(database.db);
    expect(await snapshot()).toEqual(before);
  });
});
