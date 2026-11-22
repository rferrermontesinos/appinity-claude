import { isExceptionalMutual } from '@appinity/algorithms';
import { userAffinities, userBlocks, userProfiles, users, type Database } from '@appinity/database';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type AnyColumn } from 'drizzle-orm';

/**
 * Ranking de almas gemelas (§4, fase 6). Lee las afinidades ya calculadas (nunca calcula al abrir la app).
 *
 * - Solo personas elegibles: activas, no borradas, mayoría de edad confirmada y del mismo dataset que quien consulta.
 *   La elegibilidad por evidencia ya la aplica el cálculo (sin preferencias suficientes no hay fila).
 * - Se excluyen el propio usuario y los bloqueos en cualquier dirección.
 * - Orden estable: afinidad, confianza, objetos en común y, en último término, el id (determinista).
 * - Versión gratuita: las 50 primeras. Si hay 12 candidatas, se devuelven 12; nunca se rellena.
 */
export const FREE_SOULMATES_LIMIT = 50;

export interface SoulmateRow {
  rank: number;
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  score: number;
  confidence: number;
  categoriesCompared: number;
  exceptionalMutual: boolean;
}

/** Condición SQL: no hay bloqueo entre `a` y `b` en ninguna dirección. */
export function notBlocked(a: string, b: AnyColumn | string) {
  return sql`not exists (select 1 from ${userBlocks} where (${userBlocks.blockerUserId} = ${a} and ${userBlocks.blockedUserId} = ${b}) or (${userBlocks.blockerUserId} = ${b} and ${userBlocks.blockedUserId} = ${a}))`;
}

/** ¿Puede `viewer` ver a `target` (perfil y afinidad)? Mismo dataset, activo, adulto y sin bloqueos. */
export async function canSeePerson(db: Database, viewerId: string, targetId: string): Promise<boolean> {
  if (viewerId === targetId) return false;
  const [viewer] = await db.select({ dataset: users.dataset }).from(users).where(eq(users.id, viewerId));
  if (!viewer) return false;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, targetId),
        eq(users.dataset, viewer.dataset),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        isNotNull(users.adultConfirmedAt),
        notBlocked(viewerId, targetId),
      ),
    );
  return Boolean(row);
}

export async function topSoulmates(db: Database, userId: string, limit = FREE_SOULMATES_LIMIT): Promise<SoulmateRow[]> {
  const [viewer] = await db.select({ dataset: users.dataset }).from(users).where(eq(users.id, userId));
  if (!viewer) return [];
  const rows = await db
    .select({
      userId: userAffinities.targetUserId,
      score: userAffinities.score,
      confidence: userAffinities.confidence,
      categoriesCompared: userAffinities.categoriesCompared,
      displayName: userProfiles.displayName,
      countryCode: userProfiles.countryCode,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(userAffinities)
    .innerJoin(users, eq(users.id, userAffinities.targetUserId))
    .innerJoin(userProfiles, eq(userProfiles.userId, userAffinities.targetUserId))
    .where(
      and(
        eq(userAffinities.sourceUserId, userId),
        eq(users.dataset, viewer.dataset),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        isNotNull(users.adultConfirmedAt),
        notBlocked(userId, userAffinities.targetUserId),
      ),
    )
    .orderBy(desc(userAffinities.score), desc(userAffinities.confidence), desc(userAffinities.commonItems), asc(userAffinities.targetUserId))
    .limit(limit);

  // Afinidad inversa solo para el indicador de afinidad mutua excepcional (no se expone la cifra).
  const reverse = rows.length
    ? await db
        .select({ source: userAffinities.sourceUserId, score: userAffinities.score })
        .from(userAffinities)
        .where(and(eq(userAffinities.targetUserId, userId), inArray(userAffinities.sourceUserId, rows.map((r) => r.userId))))
    : [];
  const reverseBy = new Map(reverse.map((r) => [r.source, r.score]));
  return rows.map((r, i) => ({ ...r, rank: i + 1, exceptionalMutual: isExceptionalMutual(r.score, reverseBy.get(r.userId) ?? null) }));
}

