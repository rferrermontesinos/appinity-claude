import { rankCategories, type RankedCategory } from '@appinity/algorithms';

export { CATEGORY_RANKING_VERSION } from '@appinity/algorithms';
import { catalogItems, categoryAffinities, userItemProfiles, type Database } from '@appinity/database';
import { isCategory, type Category } from '@appinity/shared';
import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { topSoulmates } from './soulmates.js';

/** Almas gemelas que cuentan para la afinidad de cada categoría: las más afines. */
const RANKING_SOULMATES = 10;
/** Un objeto cuenta como gusto propio desde esta preferencia (la misma que el arranque por contenido). */
const LIKE_THRESHOLD = 0.3;

/** Orden personal del mosaico de categorías (ver `rankCategories`). Solo agregados del propio usuario. */
export async function categoryRankingFor(db: Database, userId: string): Promise<RankedCategory[]> {
  const soulmates = await topSoulmates(db, userId, RANKING_SOULMATES);
  const ids = soulmates.map((s) => s.userId);
  const affinityRows = ids.length
    ? await db
        .select({ category: categoryAffinities.category, score: categoryAffinities.score })
        .from(categoryAffinities)
        .where(and(eq(categoryAffinities.sourceUserId, userId), inArray(categoryAffinities.targetUserId, ids)))
    : [];
  const likeRows = await db
    .select({ category: catalogItems.category, likes: count() })
    .from(userItemProfiles)
    .innerJoin(catalogItems, eq(catalogItems.id, userItemProfiles.catalogItemId))
    .where(and(eq(userItemProfiles.userId, userId), gte(userItemProfiles.preferenceScore, LIKE_THRESHOLD)))
    .groupBy(catalogItems.category);
  const affinities = new Map<Category, number[]>();
  for (const r of affinityRows) if (isCategory(r.category)) affinities.set(r.category, [...(affinities.get(r.category) ?? []), r.score]);
  const likes = new Map(likeRows.filter((r) => isCategory(r.category)).map((r) => [r.category as Category, Number(r.likes)]));
  return rankCategories([...new Set<Category>([...affinities.keys(), ...likes.keys()])].map((category) => ({ category, affinities: affinities.get(category) ?? [], likes: likes.get(category) ?? 0 })));
}
