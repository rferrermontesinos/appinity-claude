import { EntityResolver } from '@appinity/catalog';
import { catalogExpansions, catalogItems, createDatabase, type DatabaseHandle } from '@appinity/database';
import type { Category, IdentifiedEntity } from '@appinity/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { EXPANSION_PAGE, expandCatalog, type PopularWorksProvider } from '../src/catalog-expansion.js';

/** Wikidata SIMULADO: nada sale a la red. */
let db: DatabaseHandle;
beforeAll(async () => {
  db = createDatabase(testEnv().DATABASE_URL!);
  await truncateAll(db.db);
});
afterAll(async () => {
  await db?.close();
});

const work = (qid: string, title: string): IdentifiedEntity => ({ category: 'movies', itemType: 'movie', title, canonicalIds: { 'wikidata:entity': qid }, confidence: 0.95, method: 'wikidata_popular' });

describe('ampliación del catálogo bajo demanda', () => {
  it('da de alta obras populares, avanza la página, no duplica y se detiene al agotarse', async () => {
    const offsets: number[] = [];
    const pages: Record<number, IdentifiedEntity[]> = {
      0: [work('Q25188', 'Origen'), work('Q24871', 'Avatar')],
      [EXPANSION_PAGE]: [work('Q24871', 'Avatar'), work('Q44578', 'Titanic')],
    };
    const provider: PopularWorksProvider = {
      popularWorks: async (_category: Category, offset: number) => {
        offsets.push(offset);
        return { works: pages[offset] ?? [], exhausted: !pages[offset] };
      },
    };
    const resolver = new EntityResolver(db.db, []);
    const first = await expandCatalog(db.db, resolver, provider, { dataset: 'live', category: 'movies' });
    expect(first).toEqual({ category: 'movies', requested: 2, itemsCreated: 2, exhausted: false });
    // La segunda página repite Avatar: no se duplica.
    const second = await expandCatalog(db.db, resolver, provider, { dataset: 'live', category: 'movies' });
    expect(second.itemsCreated).toBe(1);
    const third = await expandCatalog(db.db, resolver, provider, { dataset: 'live', category: 'movies' });
    expect(third.exhausted).toBe(true);
    // Agotada: ya no se pregunta más a Wikidata.
    expect((await expandCatalog(db.db, resolver, provider, { dataset: 'live', category: 'movies' })).requested).toBe(0);
    expect(offsets).toEqual([0, EXPANSION_PAGE, EXPANSION_PAGE * 2]);
    const movies = await db.db.select({ title: catalogItems.title }).from(catalogItems).where(and(eq(catalogItems.dataset, 'live'), eq(catalogItems.category, 'movies')));
    expect(movies.map((m) => m.title).sort()).toEqual(['Avatar', 'Origen', 'Titanic']);
    const [state] = await db.db.select().from(catalogExpansions).where(eq(catalogExpansions.category, 'movies'));
    expect(state).toMatchObject({ exhausted: true, itemsCreated: 3 });
  });

  it('restaurantes y cultura no se amplían (dependen de la zona)', async () => {
    const provider: PopularWorksProvider = { popularWorks: async () => ({ works: [work('Q1', 'X')], exhausted: false }) };
    const result = await expandCatalog(db.db, new EntityResolver(db.db, []), provider, { dataset: 'live', category: 'food' });
    expect(result).toEqual({ category: 'food', requested: 0, itemsCreated: 0, exhausted: true });
  });
});
