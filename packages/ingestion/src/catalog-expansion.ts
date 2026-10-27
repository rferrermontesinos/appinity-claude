import type { EntityResolver } from '@appinity/catalog';
import { catalogExpansions, type Database } from '@appinity/database';
import { CATEGORY_META, type Category, type Dataset, type IdentifiedEntity } from '@appinity/shared';
import { and, eq, sql } from 'drizzle-orm';

/** Obras por petición a Wikidata (por patrón; música usa dos: grupos y cantantes). */
export const EXPANSION_PAGE = 30;

export interface PopularWorksProvider {
  popularWorks(category: Category, offset: number, limit?: number): Promise<{ works: IdentifiedEntity[]; exhausted: boolean }>;
}

export interface CatalogExpansionResult {
  category: Category;
  requested: number;
  itemsCreated: number;
  exhausted: boolean;
}

/** Categorías que se pueden ampliar: obras, no lugares (restaurantes y cultura dependen de la zona). */
export const expandableCategory = (category: Category) => CATEGORY_META[category].scope !== 'local';

/**
 * Amplía el catálogo de una categoría con obras populares de Wikidata (2026-10-27), para que la lista de Categorías no
 * se acabe: entran como objetos sin señales, así que salen como «para explorar» hasta que alguien las valore. Avanza
 * una página por llamada y recuerda por dónde va (`catalog_expansions`). Las imágenes y los detalles se completan
 * después con el enriquecimiento habitual.
 */
export async function expandCatalog(
  db: Database,
  resolver: EntityResolver,
  provider: PopularWorksProvider,
  options: { dataset: Dataset; category: Category },
): Promise<CatalogExpansionResult> {
  const { dataset, category } = options;
  if (!expandableCategory(category)) return { category, requested: 0, itemsCreated: 0, exhausted: true };
  await db.insert(catalogExpansions).values({ dataset, category }).onConflictDoNothing();
  const [state] = await db
    .select()
    .from(catalogExpansions)
    .where(and(eq(catalogExpansions.dataset, dataset), eq(catalogExpansions.category, category)));
  if (state?.exhausted) return { category, requested: 0, itemsCreated: 0, exhausted: true };
  const { works, exhausted } = await provider.popularWorks(category, state?.nextOffset ?? 0, EXPANSION_PAGE);
  let itemsCreated = 0;
  for (const w of works) {
    const resolved = await resolver.resolve(
      {
        category: w.category,
        itemType: w.itemType,
        title: w.title,
        sourceKey: 'wikidata',
        sourceId: w.canonicalIds['wikidata:entity'] ?? w.title,
        canonicalIds: w.canonicalIds,
        ...(w.releaseYear ? { attributes: { releaseYear: w.releaseYear } } : {}),
      },
      dataset,
    );
    itemsCreated += resolved.itemsCreated;
  }
  await db
    .update(catalogExpansions)
    .set({
      nextOffset: sql`${catalogExpansions.nextOffset} + ${EXPANSION_PAGE}`,
      exhausted,
      itemsCreated: sql`${catalogExpansions.itemsCreated} + ${itemsCreated}`,
      updatedAt: new Date(),
    })
    .where(and(eq(catalogExpansions.dataset, dataset), eq(catalogExpansions.category, category)));
  return { category, requested: works.length, itemsCreated, exhausted };
}
