import { follows, friendships, userAffinities, userProfiles, userSettings, type Database } from '@appinity/database';
import { and, eq, inArray, or } from 'drizzle-orm';
import { ForbiddenError, NotFoundError } from './errors.js';
import { canSeePerson } from './soulmates.js';

/**
 * Seguir a creadores y amigos (decisiones 2026-10-26). Se puede seguir a una persona visible (mismo dataset, activa y
 * sin bloqueos) que tenga el perfil público de creador activado o que sea tu amiga (amistad aceptada). Seguir nunca
 * cambia gustos ni afinidades.
 */
export type FollowState = 'following' | 'not_following';

const accepted = (a: string, b: string) =>
  and(
    eq(friendships.status, 'accepted'),
    or(and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)), and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a))),
  );

/** Personas a las que `viewerId` puede seguir entre `targets`: creadores públicos o amigos, visibles. */
export async function followableAmong(db: Database, viewerId: string, targets: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!targets.length) return out;
  const creators = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(and(inArray(userSettings.userId, [...targets]), eq(userSettings.publicCreator, true)));
  const creatorSet = new Set(creators.map((c) => c.userId));
  for (const target of targets) {
    if (!(await canSeePerson(db, viewerId, target))) continue;
    if (creatorSet.has(target)) {
      out.add(target);
      continue;
    }
    const [friend] = await db.select({ id: friendships.id }).from(friendships).where(accepted(viewerId, target));
    if (friend) out.add(target);
  }
  return out;
}

export async function followPerson(db: Database, followerId: string, targetId: string, now = new Date()): Promise<{ state: FollowState }> {
  if (followerId === targetId) throw new ForbiddenError('No puedes seguirte');
  if (!(await canSeePerson(db, followerId, targetId))) throw new NotFoundError('Persona no encontrada');
  if (!(await followableAmong(db, followerId, [targetId])).has(targetId)) {
    throw new ForbiddenError('Solo puedes seguir a creadores con perfil público o a tus amigos');
  }
  await db.insert(follows).values({ followerUserId: followerId, followedUserId: targetId, createdAt: now }).onConflictDoNothing();
  return { state: 'following' };
}

export async function unfollowPerson(db: Database, followerId: string, targetId: string): Promise<{ state: FollowState }> {
  await db.delete(follows).where(and(eq(follows.followerUserId, followerId), eq(follows.followedUserId, targetId)));
  return { state: 'not_following' };
}

/** IDs que `viewerId` sigue y que siguen siendo seguibles (un examigo o un excreador se ignoran sin borrar nada). */
export async function activeFollowedIds(db: Database, viewerId: string): Promise<string[]> {
  const rows = await db.select({ id: follows.followedUserId }).from(follows).where(eq(follows.followerUserId, viewerId));
  const followable = await followableAmong(db, viewerId, rows.map((r) => r.id));
  return rows.map((r) => r.id).filter((id) => followable.has(id));
}

export async function followState(db: Database, viewerId: string, targetId: string): Promise<{ state: FollowState; canFollow: boolean }> {
  const [row] = await db
    .select({ id: follows.followedUserId })
    .from(follows)
    .where(and(eq(follows.followerUserId, viewerId), eq(follows.followedUserId, targetId)));
  const canFollow = viewerId !== targetId && (await followableAmong(db, viewerId, [targetId])).has(targetId);
  return { state: row && canFollow ? 'following' : 'not_following', canFollow };
}

export interface FollowedPersonRow {
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  affinity: number | null;
  creator: boolean;
  verified: boolean;
}

export async function listFollowing(db: Database, viewerId: string): Promise<FollowedPersonRow[]> {
  const ids = await activeFollowedIds(db, viewerId);
  if (!ids.length) return [];
  const profiles = await db.select().from(userProfiles).where(inArray(userProfiles.userId, ids));
  const settings = await db
    .select({ userId: userSettings.userId, creator: userSettings.publicCreator, verifiedAt: userSettings.creatorVerifiedAt })
    .from(userSettings)
    .where(inArray(userSettings.userId, ids));
  const affinities = await db
    .select({ target: userAffinities.targetUserId, score: userAffinities.score })
    .from(userAffinities)
    .where(and(eq(userAffinities.sourceUserId, viewerId), inArray(userAffinities.targetUserId, ids)));
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const settingOf = new Map(settings.map((s) => [s.userId, s]));
  const affinityOf = new Map(affinities.map((a) => [a.target, a.score]));
  return ids
    .map((id) => ({
      userId: id,
      displayName: profileOf.get(id)?.displayName ?? '—',
      countryCode: profileOf.get(id)?.countryCode ?? null,
      avatarUrl: profileOf.get(id)?.avatarUrl ?? null,
      affinity: affinityOf.get(id) ?? null,
      creator: settingOf.get(id)?.creator ?? false,
      verified: Boolean(settingOf.get(id)?.creator && settingOf.get(id)?.verifiedAt),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Al aceptarse una amistad, las dos personas se siguen (como en otras redes); cada una puede dejar de seguir después. */
export async function followEachOther(tx: Pick<Database, 'insert'>, a: string, b: string, now: Date): Promise<void> {
  await tx
    .insert(follows)
    .values([
      { followerUserId: a, followedUserId: b, createdAt: now },
      { followerUserId: b, followedUserId: a, createdAt: now },
    ])
    .onConflictDoNothing();
}
