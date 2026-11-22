import { consolidate, type EvidenceInput } from '@appinity/algorithms';
import type { Tx } from '@appinity/catalog';
import { userItemObservations, userItemProfiles, type Database } from '@appinity/database';
import { and, eq, inArray, sql } from 'drizzle-orm';

type Db = Database | Tx;

/**
 * Recalcula los perfiles consolidados de un usuario para los objetos indicados a partir de TODAS sus
 * observaciones vigentes (de cualquier fuente). Si un objeto se queda sin evidencias, su perfil se elimina.
 * Solo lo invocan los syncs y las desconexiones: ninguna acción dentro de la app modifica los perfiles.
 */
export async function recomputeProfiles(
  db: Db,
  userId: string,
  itemIds: Iterable<string>,
): Promise<{ upserted: number; deleted: number }> {
  const ids = [...new Set(itemIds)];
  if (!ids.length) return { upserted: 0, deleted: 0 };

  const rows = await db
    .select({
      id: userItemObservations.id,
      itemId: userItemObservations.catalogItemId,
      sourceKey: userItemObservations.sourceKey,
      knownConfidence: userItemObservations.knownConfidence,
      consumedConfidence: userItemObservations.consumedConfidence,
      preferenceScore: userItemObservations.preferenceScore,
      preferenceConfidence: userItemObservations.preferenceConfidence,
      preferenceBasis: userItemObservations.preferenceBasis,
      occurredAt: userItemObservations.occurredAt,
      syncedAt: userItemObservations.syncedAt,
    })
    .from(userItemObservations)
    .where(and(eq(userItemObservations.userId, userId), inArray(userItemObservations.catalogItemId, ids)));

  const byItem = new Map<string, EvidenceInput[]>();
  for (const r of rows) {
    const list = byItem.get(r.itemId) ?? [];
    list.push(r);
    byItem.set(r.itemId, list);
  }

  let upserted = 0;
  for (const [itemId, evidence] of byItem) {
    const p = consolidate(evidence);
    const values = {
      knownConfidence: p.knownConfidence,
      consumedConfidence: p.consumedConfidence,
      preferenceScore: p.preferenceScore,
      preferenceConfidence: p.preferenceConfidence,
      preferenceBasis: p.preferenceBasis,
      evidenceCount: p.evidenceCount,
      sourceCount: p.sourceCount,
      hasConflict: p.hasConflict,
      notes: p.notes as unknown as Record<string, unknown>,
      firstSeenAt: p.firstSeenAt,
      lastSeenAt: p.lastSeenAt,
      consolidationVersion: p.consolidationVersion,
    };
    await db
      .insert(userItemProfiles)
      .values({ userId, catalogItemId: itemId, ...values })
      .onConflictDoUpdate({
        target: [userItemProfiles.userId, userItemProfiles.catalogItemId],
        set: { ...values, updatedAt: sql`now()` },
      });
    upserted += 1;
  }

  const empty = ids.filter((id) => !byItem.has(id));
  if (empty.length) {
    await db
      .delete(userItemProfiles)
      .where(and(eq(userItemProfiles.userId, userId), inArray(userItemProfiles.catalogItemId, empty)));
  }
  return { upserted, deleted: empty.length };
}
