import { RECOMMENDATION_PARAMS_V1, rarityWeight } from '@appinity/algorithms';
import { catalogItems, userItemProfiles, userSettings, users, type Database } from '@appinity/database';
import type { Category } from '@appinity/shared';
import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { AFFINITY_MIN_PREFERENCES } from './affinities.js';

/**
 * «Lo que os une» y «Lo que te define» (2026-10-27, decisión del titular; ver docs/decisions.md).
 *
 * Rareza de una obra = cuántas personas del dataset tienen preferencia sobre ella (`holders`) frente a cuántas tienen
 * gustos suficientes para compararse (`population`, las mismas que entran en la afinidad). Coincidir en algo poco común
 * dice más de dos personas que coincidir en algo que gusta a todo el mundo.
 *
 * Privacidad (cambia la regla anterior «nunca qué objetos coinciden», con salvaguardas):
 * - Solo obras que os GUSTAN A LOS DOS (≥ umbral de apoyo del consenso, con confianza suficiente); nunca disgustos.
 * - Como mucho `SHARED_TASTES_LIMIT` obras y el recuento total; nada más de su historial.
 * - Recíproco y desactivable: si una de las dos personas lo apaga (`shareCommonTastes`), ninguna ve el de la otra.
 * - «Lo que te define» solo lo ve la propia persona.
 */
export const SHARED_TASTES_LIMIT = 5;
export const DEFINING_TASTES_LIMIT = 6;
const LIKE = RECOMMENDATION_PARAMS_V1.consensus.positiveScore;
const MIN_CONFIDENCE = RECOMMENDATION_PARAMS_V1.consensus.positiveConfidence;

export type Rarity = 'rare' | 'uncommon' | null;
/** Etiqueta para la app: ≤ 10 % de la población, «poco común» hasta el 30 %. Con muy poca gente, sin etiqueta. */
export function rarityLabel(holders: number, population: number): Rarity {
  if (population < 10) return null;
  const share = holders / population;
  return share <= 0.1 ? 'rare' : share <= 0.3 ? 'uncommon' : null;
}

/** Personas comparables del dataset (≥ AFFINITY_MIN_PREFERENCES gustos) y, por obra, cuántas tienen preferencia. */
export async function itemRarity(db: Database, dataset: 'demo' | 'live', itemIds: string[]): Promise<{ population: number; holders: Map<string, number> }> {
  const eligible = db
    .select({ userId: userItemProfiles.userId })
    .from(userItemProfiles)
    .innerJoin(users, eq(users.id, userItemProfiles.userId))
    .where(and(eq(users.dataset, dataset), eq(users.status, 'active'), isNull(users.deletedAt), isNotNull(userItemProfiles.preferenceScore)))
    .groupBy(userItemProfiles.userId)
    .having(sql`count(*) >= ${AFFINITY_MIN_PREFERENCES}`)
    .as('eligible');
  const [pop] = await db.select({ n: sql<number>`count(*)::int` }).from(eligible);
  const holders = new Map<string, number>();
  if (itemIds.length) {
    const rows = await db
      .select({ itemId: userItemProfiles.catalogItemId, n: sql<number>`count(*)::int` })
      .from(userItemProfiles)
      .innerJoin(eligible, eq(eligible.userId, userItemProfiles.userId))
      .where(and(inArray(userItemProfiles.catalogItemId, itemIds), isNotNull(userItemProfiles.preferenceScore)))
      .groupBy(userItemProfiles.catalogItemId);
    for (const r of rows) holders.set(r.itemId, r.n);
  }
  return { population: pop?.n ?? 0, holders };
}

async function likes(db: Database, userId: string): Promise<Map<string, { score: number; category: Category }>> {
  const rows = await db
    .select({ itemId: userItemProfiles.catalogItemId, score: userItemProfiles.preferenceScore, category: catalogItems.category })
    .from(userItemProfiles)
    .innerJoin(catalogItems, eq(catalogItems.id, userItemProfiles.catalogItemId))
    .where(and(eq(userItemProfiles.userId, userId), gte(userItemProfiles.preferenceScore, LIKE), gte(userItemProfiles.preferenceConfidence, MIN_CONFIDENCE)));
  return new Map(rows.map((r) => [r.itemId, { score: r.score!, category: r.category }]));
}

async function sharing(db: Database, userId: string): Promise<{ dataset: 'demo' | 'live'; on: boolean } | null> {
  const [row] = await db
    .select({ dataset: users.dataset, on: userSettings.shareCommonTastes })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId));
  return row ? { dataset: row.dataset, on: row.on ?? true } : null;
}

export interface TasteRef {
  itemId: string;
  rarity: Rarity;
}

export interface SharedTastes {
  /** `off_you`: lo has desactivado tú; `off_them`: la otra persona (no se dice nada más de ella). */
  status: 'ok' | 'off_you' | 'off_them';
  total: number;
  items: TasteRef[];
}

/**
 * Obras que os gustan a los dos, de la más rara a la más común (empate: más gusto entre los dos). La visibilidad de la
 * persona la comprueba quien llama (`canSeePerson`).
 */
export async function sharedTastes(db: Database, viewerId: string, targetId: string, limit = SHARED_TASTES_LIMIT): Promise<SharedTastes> {
  const [me, them] = await Promise.all([sharing(db, viewerId), sharing(db, targetId)]);
  if (!me?.on) return { status: 'off_you', total: 0, items: [] };
  if (!them?.on) return { status: 'off_them', total: 0, items: [] };
  const [mine, theirs] = await Promise.all([likes(db, viewerId), likes(db, targetId)]);
  const common = [...mine.keys()].filter((id) => theirs.has(id));
  const { population, holders } = await itemRarity(db, me.dataset, common);
  const ranked = common
    .map((id) => ({ id, holders: holders.get(id) ?? 2, together: mine.get(id)!.score + theirs.get(id)!.score }))
    .sort((a, b) => a.holders - b.holders || b.together - a.together || a.id.localeCompare(b.id));
  return { status: 'ok', total: common.length, items: ranked.slice(0, limit).map((r) => ({ itemId: r.id, rarity: rarityLabel(r.holders, population) })) };
}

/** Tus obras más características: mucho gusto y poco comunes (como mucho 2 por categoría, para que se vea la variedad). */
export async function definingTastes(db: Database, userId: string, limit = DEFINING_TASTES_LIMIT): Promise<TasteRef[]> {
  const me = await sharing(db, userId);
  if (!me) return [];
  const mine = await likes(db, userId);
  const { population, holders } = await itemRarity(db, me.dataset, [...mine.keys()]);
  const ranked = [...mine]
    .map(([id, p]) => ({ id, category: p.category, holders: holders.get(id) ?? 1, weight: p.score * rarityWeight(holders.get(id) ?? 1, population) }))
    .sort((a, b) => b.weight - a.weight || a.holders - b.holders || a.id.localeCompare(b.id));
  const perCategory = new Map<Category, number>();
  const out: TasteRef[] = [];
  for (const r of ranked) {
    if ((perCategory.get(r.category) ?? 0) >= 2) continue;
    perCategory.set(r.category, (perCategory.get(r.category) ?? 0) + 1);
    out.push({ itemId: r.id, rarity: rarityLabel(r.holders, population) });
    if (out.length >= limit) break;
  }
  return out;
}
