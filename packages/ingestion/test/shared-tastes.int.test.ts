import { catalogItems, createDatabase, userItemProfiles, userSettings, type DatabaseHandle } from '@appinity/database';
import type { Category } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createOrResetLocalUser, definingTastes, rarityLabel, sharedTastes } from '../src/index.js';

/**
 * «Lo que os une» y «Lo que te define» (2026-10-27). Datos SINTÉTICOS (dataset live, handles «test_une_*»):
 * - A: solo la conocen Vera y Tomás (rara); C: 5 personas; B: todas (común).
 * - D: a Vera le gusta y a Tomás no; E: a Tomás le gusta con poca confianza. Ninguna de las dos debe salir.
 */
let database: DatabaseHandle;
let vera = '';
let tomas = '';
const items: Record<string, string> = {};

async function item(key: string, category: Category) {
  const [row] = await database.db
    .insert(catalogItems)
    .values({ dataset: 'live', category, itemType: category === 'music' ? 'artist' : 'movie', title: `Obra ${key}`, normalizedTitle: `obra ${key.toLowerCase()}`, createdVia: 'test' })
    .returning({ id: catalogItems.id });
  items[key] = row!.id;
}

async function prefer(userId: string, key: string, score: number, confidence = 1) {
  await database.db.insert(userItemProfiles).values({
    userId,
    catalogItemId: items[key]!,
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

beforeAll(async () => {
  database = createDatabase(testEnv().DATABASE_URL!, { max: 4 });
  await truncateAll(database.db);
  for (const [key, category] of [['A', 'movies'], ['B', 'movies'], ['C', 'movies'], ['D', 'music'], ['E', 'music'], ['F1', 'series'], ['F2', 'series'], ['F3', 'series']] as const) await item(key, category);
  vera = (await createOrResetLocalUser(database.db, { handle: 'test_une_vera', displayName: 'Vera' })).userId;
  tomas = (await createOrResetLocalUser(database.db, { handle: 'test_une_tomas', displayName: 'Tomás' })).userId;
  for (const [key, v, t, tc] of [['A', 1, 1, 1], ['B', 1, 1, 1], ['C', 0.5, 1, 1], ['D', 1, -0.5, 1], ['E', 0.5, 1, 0.3]] as const) {
    await prefer(vera, key, v);
    await prefer(tomas, key, t, tc);
  }
  // Tres obras de la misma categoría que a Vera le encantan: «Lo que te define» enseña como mucho 2 por categoría.
  for (const key of ['F1', 'F2', 'F3']) await prefer(vera, key, 1);
  // Relleno: 10 personas más con B (común) y 3 de ellas con C (media). Ninguna conoce A.
  for (let i = 0; i < 10; i++) {
    const { userId } = await createOrResetLocalUser(database.db, { handle: `test_une_${i}`, displayName: `Relleno ${i}` });
    await prefer(userId, 'B', 0.5);
    await prefer(userId, 'D', 0.5);
    await prefer(userId, i < 3 ? 'C' : 'E', 0.5);
  }
});

afterAll(async () => {
  await database?.close();
});

describe('Lo que os une', () => {
  it('solo obras que gustan a los dos (ni disgustos ni poca confianza), de la más rara a la más común', async () => {
    const shared = await sharedTastes(database.db, vera, tomas);
    expect(shared.status).toBe('ok');
    expect(shared.total).toBe(3);
    expect(shared.items.map((i) => i.itemId)).toEqual([items.A, items.C, items.B]);
    // 12 personas comparables: A (2 de 12, 17 %) es poco común; C (5, 42 %) y B (12) no llevan etiqueta.
    expect(shared.items.map((i) => i.rarity)).toEqual(['uncommon', null, null]);
  });

  it('respeta el límite y cuenta el total', async () => {
    const shared = await sharedTastes(database.db, vera, tomas, 2);
    expect(shared.items).toHaveLength(2);
    expect(shared.total).toBe(3);
  });

  it('es recíproco: si cualquiera de los dos lo desactiva, nadie ve nada', async () => {
    await database.db.update(userSettings).set({ shareCommonTastes: false }).where(eq(userSettings.userId, tomas));
    expect(await sharedTastes(database.db, vera, tomas)).toEqual({ status: 'off_them', total: 0, items: [] });
    expect(await sharedTastes(database.db, tomas, vera)).toEqual({ status: 'off_you', total: 0, items: [] });
    await database.db.update(userSettings).set({ shareCommonTastes: true }).where(eq(userSettings.userId, tomas));
    expect((await sharedTastes(database.db, tomas, vera)).status).toBe('ok');
  });
});

describe('Lo que te define', () => {
  it('lo que más gusta y menos se conoce primero, como mucho 2 por categoría', async () => {
    const defining = await definingTastes(database.db, vera);
    const ids = defining.map((d) => d.itemId);
    const series = [items.F1, items.F2, items.F3];
    // Primero lo que solo conoce Vera (F, como mucho 2) y después A, que comparte con una persona más.
    expect(series).toContain(ids[0]);
    expect(series).toContain(ids[1]);
    expect(ids[2]).toBe(items.A);
    expect(ids.filter((id) => series.includes(id))).toHaveLength(2);
    expect(ids.filter((id) => [items.A, items.B, items.C].includes(id))).toHaveLength(2);
    // B (la conoce todo el mundo) queda por detrás de A aunque a Vera le guste igual.
    expect(ids.indexOf(items.B!)).toBeGreaterThan(ids.indexOf(items.A!));
  });
});

describe('etiqueta de rareza', () => {
  it('rara hasta el 10 %, poco común hasta el 30 % y nada con menos de 10 personas', () => {
    expect(rarityLabel(1, 100)).toBe('rare');
    expect(rarityLabel(25, 100)).toBe('uncommon');
    expect(rarityLabel(50, 100)).toBeNull();
    expect(rarityLabel(1, 5)).toBeNull();
  });
});
