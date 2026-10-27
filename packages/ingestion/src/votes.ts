import { itemVotes, recommendationActions, userConnections, userItemObservations, type Database } from '@appinity/database';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '@appinity/catalog';
import { ConflictError } from './errors.js';
import { recomputeProfiles } from './profiles.js';

/**
 * Votos en la app (decisión del titular, 2026-10-27). Cambia la regla anterior («nada de lo que haces en la app cambia
 * tus gustos»): un voto explícito en Inicio es una observación de la fuente interna `appinity`, con el MISMO peso que
 * una nota de una fuente externa, y recalcula el perfil (y después la afinidad). Deslizar sin votar, guardar, deshacer,
 * amistad y chat siguen sin cambiar gustos.
 * - Valores (modelo binario + «Me encanta», 2026-10-27): −1 «No me gusta», +1 «Me gusta», +2 «Me encanta». −2 solo
 *   existe en votos antiguos. «Paso» no es un voto: es un descarte que caduca a los 30 días (home.ts).
 * - Un voto es definitivo para esa obra: ya no sale en recomendaciones, ni se puede guardar o pasar (salvo deshacer).
 */
export const VOTE_SOURCE_KEY = 'appinity';
export const VOTE_MAPPER_VERSION = 'appinity-vote-v1';
export type VoteValue = -1 | 1 | 2;

/** Preferencia (−1…+1) de cada nivel: el mismo rango que una nota externa normalizada (−2: votos antiguos). */
export const VOTE_PREFERENCE: Record<-2 | -1 | 1 | 2, number> = { [-2]: -1, [-1]: -0.5, 1: 0.5, 2: 1 };

const recordId = (itemId: string) => `vote:${itemId}`;

/** Conexión interna `appinity` del usuario (no se muestra entre las fuentes; sus votos sí, en «Tus gustos»). */
async function voteConnection(db: Database | Tx, userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: userConnections.id })
    .from(userConnections)
    .where(and(eq(userConnections.userId, userId), eq(userConnections.sourceKey, VOTE_SOURCE_KEY), eq(userConnections.status, 'active')));
  if (existing) return existing.id;
  const [created] = await db.insert(userConnections).values({ userId, sourceKey: VOTE_SOURCE_KEY, status: 'active' }).returning({ id: userConnections.id });
  return created!.id;
}

/** ¿Ya votó esta obra? (Un voto es definitivo.) */
export async function hasVoted(db: Database | Tx, userId: string, itemId: string): Promise<boolean> {
  const [row] = await db.select({ v: itemVotes.catalogItemId }).from(itemVotes).where(and(eq(itemVotes.userId, userId), eq(itemVotes.catalogItemId, itemId)));
  return Boolean(row);
}

export async function castVote(db: Database, userId: string, itemId: string, value: VoteValue, now = new Date()): Promise<{ actionId: string; profileChanged: boolean }> {
  return db.transaction(async (tx) => {
    if (await hasVoted(tx, userId, itemId)) throw new ConflictError('Ya has votado esta obra');
    await tx.insert(itemVotes).values({ userId, catalogItemId: itemId, value, createdAt: now });
    const [action] = await tx.insert(recommendationActions).values({ userId, catalogItemId: itemId, action: 'vote', createdAt: now }).returning({ id: recommendationActions.id });
    const connectionId = await voteConnection(tx, userId);
    const preference = VOTE_PREFERENCE[value];
    await tx.insert(userItemObservations).values({
      userId,
      catalogItemId: itemId,
      connectionId,
      sourceKey: VOTE_SOURCE_KEY,
      sourceRecordId: recordId(itemId),
      observationKind: 'vote',
      mapperVersion: VOTE_MAPPER_VERSION,
      knownConfidence: 1,
      consumedConfidence: 1,
      preferenceScore: preference,
      preferenceConfidence: 1,
      preferenceBasis: 'explicit_rating',
      engagement: { type: 'rating', value, unit: 'appinity_4' },
      occurredAt: now,
      timestampPrecision: 'instant',
      contentHash: createHash('sha256').update(`${VOTE_MAPPER_VERSION}:${value}`).digest('hex'),
      metadata: { level: value },
    });
    await recomputeProfiles(tx, userId, [itemId]);
    return { actionId: action!.id, profileChanged: true };
  });
}

/** Lo que la ficha necesita saber de una obra: tu voto (null si no hay o es un «No lo conozco» antiguo) y si la guardaste. */
export async function itemOpinion(db: Database, userId: string, itemId: string): Promise<{ voted: boolean; vote: -2 | -1 | 1 | 2 | null; saved: boolean }> {
  const [vote] = await db.select({ value: itemVotes.value }).from(itemVotes).where(and(eq(itemVotes.userId, userId), eq(itemVotes.catalogItemId, itemId)));
  const [kept] = await db
    .select({ id: recommendationActions.id })
    .from(recommendationActions)
    .where(and(eq(recommendationActions.userId, userId), eq(recommendationActions.catalogItemId, itemId), eq(recommendationActions.action, 'keep'), isNull(recommendationActions.undoneAt)))
    .limit(1);
  return { voted: Boolean(vote), vote: (vote?.value ?? null) as -2 | -1 | 1 | 2 | null, saved: Boolean(kept) };
}

/** Deshacer un voto: borra el voto y su observación y recalcula el perfil de esa obra. */
export async function removeVote(tx: Tx, userId: string, itemId: string): Promise<boolean> {
  const [vote] = await tx.delete(itemVotes).where(and(eq(itemVotes.userId, userId), eq(itemVotes.catalogItemId, itemId))).returning({ value: itemVotes.value });
  if (!vote || vote.value === null) return false;
  await tx
    .delete(userItemObservations)
    .where(and(eq(userItemObservations.userId, userId), eq(userItemObservations.sourceKey, VOTE_SOURCE_KEY), eq(userItemObservations.sourceRecordId, recordId(itemId))));
  await recomputeProfiles(tx, userId, [itemId]);
  return true;
}
