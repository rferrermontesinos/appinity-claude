import { AFFINITY_PARAMS_V1, AFFINITY_VERSION, affinity, indexPreferences, type AffinityParams, type PreferenceIndex } from '@appinity/algorithms';
import { catalogItems, categoryAffinities, userAffinities, userItemProfiles, users, type Database } from '@appinity/database';
import { isCategory, type Category } from '@appinity/shared';
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

/**
 * Recálculo de afinidades direccionales (§11).
 *
 * Usuarios elegibles (mínimos documentados en docs/decisions.md): cuenta activa, no borrada, mayoría de edad confirmada
 * y al menos AFFINITY_MIN_PREFERENCES preferencias consolidadas. Solo se comparan usuarios del mismo dataset: los
 * simulados de la demo nunca se mezclan con cuentas reales. Los bloqueos llegarán con la fase 10 (People y Friends).
 *
 * Prefiltro: solo se calculan parejas que comparten al menos un objeto con preferencia. Es exacto, no aproximado: sin
 * objetos en común todas las categorías son NULL y no hay fila (se comprueba contra el cálculo exhaustivo en tests).
 */
export const AFFINITY_MIN_PREFERENCES = 3;

/** Regla de producto de la afinidad mutua (§4), reexportada para la API. */
export { AFFINITY_VERSION, isExceptionalMutual } from '@appinity/algorithms';

export interface AffinityRecomputeOptions {
  /** Usuarios cuya evidencia cambió: se recalculan sus parejas en ambas direcciones. Sin ellos, todo el dataset. */
  userIds?: readonly string[];
  params?: AffinityParams;
  now?: Date;
}

export interface AffinityRecomputeResult {
  dataset: 'demo' | 'live';
  eligibleUsers: number;
  focusUsers: number;
  pairsCompared: number;
  pairsWithAffinity: number;
  categoryRows: number;
}

type Dataset = 'demo' | 'live';

async function loadPreferences(db: Database, dataset: Dataset): Promise<Map<string, PreferenceIndex>> {
  const rows = await db
    .select({
      userId: userItemProfiles.userId,
      itemId: userItemProfiles.catalogItemId,
      category: catalogItems.category,
      score: userItemProfiles.preferenceScore,
      confidence: userItemProfiles.preferenceConfidence,
    })
    .from(userItemProfiles)
    .innerJoin(users, eq(users.id, userItemProfiles.userId))
    .innerJoin(catalogItems, eq(catalogItems.id, userItemProfiles.catalogItemId))
    .where(
      and(
        eq(users.dataset, dataset),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        isNotNull(users.adultConfirmedAt),
        isNotNull(userItemProfiles.preferenceScore),
      ),
    );
  const byUser = new Map<string, Array<{ itemId: string; category: Category; score: number; confidence: number }>>();
  for (const r of rows) {
    if (r.score === null || r.confidence === null || !isCategory(r.category)) continue;
    const list = byUser.get(r.userId) ?? [];
    list.push({ itemId: r.itemId, category: r.category, score: r.score, confidence: r.confidence });
    byUser.set(r.userId, list);
  }
  const indexed = new Map<string, PreferenceIndex>();
  for (const [userId, points] of byUser) if (points.length >= AFFINITY_MIN_PREFERENCES) indexed.set(userId, indexPreferences(points));
  return indexed;
}

/** Usuarios que comparten al menos un objeto con preferencia con `userId` (prefiltro exacto). */
function candidatesOf(userId: string, profiles: Map<string, PreferenceIndex>, usersByItem: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const byItem of profiles.get(userId)?.values() ?? []) {
    for (const itemId of byItem.keys()) for (const other of usersByItem.get(itemId) ?? []) if (other !== userId) out.add(other);
  }
  return out;
}

/**
 * Recalcula y guarda las afinidades. Sustituye, en una transacción, todas las filas en las que interviene un usuario
 * del foco (como origen o como destino); con el dataset entero, todas las del dataset.
 */
export async function recomputeAffinities(db: Database, options: AffinityRecomputeOptions = {}): Promise<AffinityRecomputeResult[]> {
  const params = options.params ?? AFFINITY_PARAMS_V1;
  const computedAt = options.now ?? new Date();
  let datasets: Dataset[] = ['demo', 'live'];
  if (options.userIds) {
    if (!options.userIds.length) return [];
    const rows = await db.selectDistinct({ dataset: users.dataset }).from(users).where(inArray(users.id, [...options.userIds]));
    datasets = rows.map((r) => r.dataset);
  }

  const results: AffinityRecomputeResult[] = [];
  for (const dataset of datasets) {
    const profiles = await loadPreferences(db, dataset);
    const usersByItem = new Map<string, string[]>();
    for (const [userId, index] of profiles) {
      for (const byItem of index.values()) for (const itemId of byItem.keys()) usersByItem.set(itemId, [...(usersByItem.get(itemId) ?? []), userId]);
    }
    const datasetUsers = (await db.select({ id: users.id }).from(users).where(eq(users.dataset, dataset))).map((u) => u.id);
    const inDataset = new Set(datasetUsers);
    const focus = options.userIds ? [...new Set(options.userIds)].filter((id) => inDataset.has(id)) : datasetUsers;

    // Parejas ordenadas a calcular: (A, B) y (B, A) para cada A del foco y cada B que comparte algún objeto.
    const pairs = new Map<string, [string, string]>();
    for (const a of focus) {
      if (!profiles.has(a)) continue;
      for (const b of candidatesOf(a, profiles, usersByItem)) {
        pairs.set(`${a}|${b}`, [a, b]);
        pairs.set(`${b}|${a}`, [b, a]);
      }
    }

    const userRows: Array<typeof userAffinities.$inferInsert> = [];
    const categoryRows: Array<typeof categoryAffinities.$inferInsert> = [];
    for (const [source, target] of pairs.values()) {
      const result = affinity(profiles.get(source)!, profiles.get(target)!, params);
      if (result.score === null) continue;
      userRows.push({
        sourceUserId: source,
        targetUserId: target,
        score: result.score,
        confidence: result.confidence,
        categoriesCompared: result.categoriesCompared,
        commonItems: result.commonItems,
        algorithmVersion: AFFINITY_VERSION,
        computedAt,
      });
      for (const c of Object.values(result.categories)) {
        if (c.score === null || c.agreement === null) continue;
        categoryRows.push({
          sourceUserId: source,
          targetUserId: target,
          category: c.category,
          score: c.score,
          confidence: c.confidence,
          commonItems: c.commonItems,
          effectiveEvidence: c.effectiveEvidence,
          agreement: c.agreement,
          coverage: c.coverage,
          algorithmVersion: AFFINITY_VERSION,
          computedAt,
        });
      }
    }

    await db.transaction(async (tx) => {
      // Un recálculo a la vez por dataset: dos syncs simultáneos no se pisan las filas.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`affinity:${dataset}`}, 0))`);
      if (focus.length) {
        for (let i = 0; i < focus.length; i += 500) {
          const chunk = focus.slice(i, i + 500);
          await tx.delete(userAffinities).where(or(inArray(userAffinities.sourceUserId, chunk), inArray(userAffinities.targetUserId, chunk)));
          await tx.delete(categoryAffinities).where(or(inArray(categoryAffinities.sourceUserId, chunk), inArray(categoryAffinities.targetUserId, chunk)));
        }
      }
      for (let i = 0; i < userRows.length; i += 500) await tx.insert(userAffinities).values(userRows.slice(i, i + 500));
      for (let i = 0; i < categoryRows.length; i += 500) await tx.insert(categoryAffinities).values(categoryRows.slice(i, i + 500));
    });

    results.push({
      dataset,
      eligibleUsers: profiles.size,
      focusUsers: focus.length,
      pairsCompared: pairs.size,
      pairsWithAffinity: userRows.length,
      categoryRows: categoryRows.length,
    });
  }
  return results;
}
