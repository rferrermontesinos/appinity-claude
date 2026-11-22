import { userItemProfiles, userProfiles, type Database } from '@appinity/database';
import { RECOMMENDATION_PARAMS_V1 } from '@appinity/algorithms';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { activeFollowedIds } from './follows.js';
import { CONSENSUS_SOULMATES, topSoulmates } from './soulmates.js';

/**
 * «Entre tus almas gemelas» en la ficha (2026-10-27): qué opina tu círculo de UNA obra, venga de donde venga la ficha.
 * - Almas gemelas: solo el Top 50 (como el consenso) y solo recuentos; nunca quién ni su historial.
 * - Seguidos: nombres solo de quienes sigues y les gusta (la misma regla que el motivo combinado de Inicio).
 * - Solo cuentan preferencias con confianza suficiente (el umbral de un apoyo del consenso).
 */
export interface ItemCircle {
  /** Almas gemelas consideradas (Top 50 o menos). */
  soulmates: number;
  /** De ellas, con preferencia sobre la obra. Siempre = love + like + mixed + dislike. */
  opinionated: number;
  /** Preferencia ≥ 0,8 (un «Me encanta» o una nota muy alta). */
  love: number;
  /** Preferencia ≥ 0,5 (un «Me gusta»). */
  like: number;
  /** Entre −0,5 y 0,5: ni sí ni no. */
  mixed: number;
  /** Preferencia ≤ −0,5 (un «No me gusta»). */
  dislike: number;
  followedLikers: { names: string[]; count: number };
}

const LOVE = RECOMMENDATION_PARAMS_V1.followed.minScore;
const LIKE = RECOMMENDATION_PARAMS_V1.consensus.positiveScore;
const MIN_CONFIDENCE = RECOMMENDATION_PARAMS_V1.consensus.positiveConfidence;

export async function itemCircle(db: Database, userId: string, itemId: string): Promise<ItemCircle> {
  const soulmates = await topSoulmates(db, userId, CONSENSUS_SOULMATES);
  const followedIds = await activeFollowedIds(db, userId);
  const ids = [...new Set([...soulmates.map((s) => s.userId), ...followedIds])];
  const prefs = ids.length
    ? await db
        .select({ userId: userItemProfiles.userId, score: userItemProfiles.preferenceScore, confidence: userItemProfiles.preferenceConfidence })
        .from(userItemProfiles)
        .where(and(eq(userItemProfiles.catalogItemId, itemId), inArray(userItemProfiles.userId, ids), isNotNull(userItemProfiles.preferenceScore)))
    : [];
  const confident = new Map(prefs.filter((p) => p.score !== null && (p.confidence ?? 0) >= MIN_CONFIDENCE).map((p) => [p.userId, p.score!]));

  const circle: ItemCircle = { soulmates: soulmates.length, opinionated: 0, love: 0, like: 0, mixed: 0, dislike: 0, followedLikers: { names: [], count: 0 } };
  for (const s of soulmates) {
    const score = confident.get(s.userId);
    if (score === undefined) continue;
    circle.opinionated += 1;
    if (score >= LOVE) circle.love += 1;
    else if (score >= LIKE) circle.like += 1;
    else if (score > -LIKE) circle.mixed += 1;
    else circle.dislike += 1;
  }

  const likers = followedIds.filter((id) => (confident.get(id) ?? -1) >= LIKE);
  if (likers.length) {
    const names = new Map(
      (await db.select({ id: userProfiles.userId, name: userProfiles.displayName }).from(userProfiles).where(inArray(userProfiles.userId, likers))).map((r) => [r.id, r.name]),
    );
    circle.followedLikers = { names: likers.slice(0, 2).map((id) => names.get(id) ?? '—'), count: likers.length };
  }
  return circle;
}
