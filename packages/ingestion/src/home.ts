import { catalogItems, homeDismissals, recommendationActions, recommendationImpressions, users, type Database } from '@appinity/database';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { NotFoundError } from './errors.js';

/**
 * Acciones de Home (§2). Ninguna toca user_item_profiles ni las afinidades: solo deciden qué se muestra.
 * - Descartar: el objeto no vuelve a Home mientras se conserve el descarte (Categories lo sigue mostrando).
 * - Conservar: pasa a la siguiente tarjeta; puede reaparecer en otra sesión (no crea una lista).
 * - Deshacer: revierte la última acción no deshecha y devuelve la tarjeta. No borra impresiones.
 */
export type HomeAction = 'dismiss' | 'keep';

/** El objeto debe ser del mismo dataset que el usuario (la demo no toca el catálogo real y al revés). */
async function assertItemVisible(db: Database, userId: string, itemId: string) {
  const [row] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .innerJoin(users, eq(users.dataset, catalogItems.dataset))
    .where(and(eq(catalogItems.id, itemId), eq(users.id, userId)));
  if (!row) throw new NotFoundError('Objeto no encontrado');
}

/** Registra que la tarjeta se mostró de verdad. `isNew`: era la primera vez (indicador NEW). */
export async function recordImpression(db: Database, userId: string, itemId: string, now = new Date()): Promise<{ isNew: boolean }> {
  await assertItemVisible(db, userId, itemId);
  const [row] = await db
    .insert(recommendationImpressions)
    .values({ userId, catalogItemId: itemId, firstShownAt: now, lastShownAt: now })
    .onConflictDoUpdate({
      target: [recommendationImpressions.userId, recommendationImpressions.catalogItemId],
      set: { lastShownAt: now, timesShown: sql`${recommendationImpressions.timesShown} + 1` },
    })
    .returning({ timesShown: recommendationImpressions.timesShown });
  return { isNew: row!.timesShown === 1 };
}

/** Objetos que el usuario nunca ha visto en Home (para el indicador NEW). */
export async function unseenItems(db: Database, userId: string, itemIds: readonly string[]): Promise<Set<string>> {
  if (!itemIds.length) return new Set();
  const seen = await db
    .select({ itemId: recommendationImpressions.catalogItemId })
    .from(recommendationImpressions)
    .where(and(eq(recommendationImpressions.userId, userId), inArray(recommendationImpressions.catalogItemId, [...itemIds])));
  const seenIds = new Set(seen.map((s) => s.itemId));
  return new Set(itemIds.filter((id) => !seenIds.has(id)));
}

export async function applyHomeAction(db: Database, userId: string, itemId: string, action: HomeAction, now = new Date()): Promise<{ actionId: string }> {
  await assertItemVisible(db, userId, itemId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recommendationActions)
      .values({ userId, catalogItemId: itemId, action, createdAt: now })
      .returning({ id: recommendationActions.id });
    if (action === 'dismiss') {
      await tx.insert(homeDismissals).values({ userId, catalogItemId: itemId, createdAt: now }).onConflictDoNothing();
    }
    return { actionId: row!.id };
  });
}

/** Deshace la última acción vigente del usuario. Devuelve el objeto para volver a mostrarlo, o null si no hay nada. */
export async function undoLastHomeAction(db: Database, userId: string, now = new Date()): Promise<{ itemId: string; action: HomeAction } | null> {
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select()
      .from(recommendationActions)
      .where(and(eq(recommendationActions.userId, userId), isNull(recommendationActions.undoneAt)))
      .orderBy(desc(recommendationActions.createdAt), desc(recommendationActions.id))
      .limit(1)
      .for('update');
    if (!last) return null;
    await tx.update(recommendationActions).set({ undoneAt: now }).where(eq(recommendationActions.id, last.id));
    if (last.action === 'dismiss') {
      await tx.delete(homeDismissals).where(and(eq(homeDismissals.userId, userId), eq(homeDismissals.catalogItemId, last.catalogItemId)));
    }
    return { itemId: last.catalogItemId, action: last.action };
  });
}
