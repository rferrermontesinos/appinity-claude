import { friendships, userAffinities, userBlocks, userProfiles, userReports, users, type Database } from '@appinity/database';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { ConflictError, ForbiddenError, NotFoundError } from './errors.js';
import { canSeePerson } from './soulmates.js';

/**
 * Amigos, bloqueos y reportes (§4, §16 y §17). Toda operación parte del usuario de la sesión y comprueba que puede ver
 * a la otra persona (mismo dataset, activa y sin bloqueos). Nada de esto toca gustos ni afinidades.
 */
export type FriendshipState = 'none' | 'pending_out' | 'pending_in' | 'friends';

const pair = (a: string, b: string) =>
  or(and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)), and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)));

/** Relación vista por `viewer`. Un rechazo se le muestra a quien envió la solicitud como «pendiente». */
export async function friendshipState(db: Database, viewer: string, other: string): Promise<{ state: FriendshipState; requestId: string | null }> {
  const [row] = await db.select().from(friendships).where(pair(viewer, other));
  if (!row) return { state: 'none', requestId: null };
  if (row.status === 'accepted') return { state: 'friends', requestId: row.id };
  if (row.requesterId === viewer) return { state: 'pending_out', requestId: row.id };
  // Recibida: pendiente (puede responder) o ya rechazada por el propio viewer (no vuelve a aparecer).
  return row.status === 'pending' ? { state: 'pending_in', requestId: row.id } : { state: 'none', requestId: null };
}

export async function sendFriendRequest(db: Database, from: string, to: string, now = new Date()): Promise<{ state: FriendshipState }> {
  if (!(await canSeePerson(db, from, to))) throw new NotFoundError('Persona no encontrada');
  const [row] = await db.select().from(friendships).where(pair(from, to));
  if (row) {
    if (row.status === 'accepted') throw new ConflictError('Ya sois amigos');
    // Si la otra persona ya había pedido amistad, pedirla también equivale a aceptarla.
    if (row.addresseeId === from && row.status === 'pending') {
      await db.update(friendships).set({ status: 'accepted', respondedAt: now }).where(eq(friendships.id, row.id));
      return { state: 'friends' };
    }
    // Ya enviada (o rechazada sin que se sepa): no se duplica ni se insiste.
    if (row.requesterId === from) return { state: 'pending_out' };
    // Quien había rechazado una solicitud puede pedir amistad después: la fila cambia de sentido.
    await db.update(friendships).set({ requesterId: from, addresseeId: to, status: 'pending', createdAt: now, respondedAt: null }).where(eq(friendships.id, row.id));
    return { state: 'pending_out' };
  }
  await db.insert(friendships).values({ requesterId: from, addresseeId: to, createdAt: now });
  return { state: 'pending_out' };
}

/** Solo quien recibe la solicitud puede responderla. */
export async function respondFriendRequest(db: Database, userId: string, requestId: string, accept: boolean, now = new Date()): Promise<{ state: FriendshipState }> {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, requestId));
  if (!row || row.addresseeId !== userId || row.status !== 'pending') throw new NotFoundError('Solicitud no encontrada');
  if (accept && !(await canSeePerson(db, userId, row.requesterId))) throw new NotFoundError('Persona no encontrada');
  await db.update(friendships).set({ status: accept ? 'accepted' : 'rejected', respondedAt: now }).where(eq(friendships.id, requestId));
  return { state: accept ? 'friends' : 'none' };
}

/** Eliminar amistad o cancelar una solicitud enviada. */
export async function removeFriendship(db: Database, userId: string, other: string): Promise<void> {
  const [row] = await db.select().from(friendships).where(pair(userId, other));
  if (!row) throw new NotFoundError('No hay ninguna relación con esa persona');
  // Una solicitud recibida se rechaza, no se borra (así no puede reenviarse sin fin).
  if (row.status === 'pending' && row.addresseeId === userId) throw new ForbiddenError('Rechaza la solicitud en lugar de borrarla');
  await db.delete(friendships).where(eq(friendships.id, row.id));
}

export interface FriendRow {
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  /** Mi afinidad hacia esa persona (NULL si no hay evidencia comparable: «—»). */
  affinity: number | null;
  requestId: string;
}

export async function listFriends(db: Database, userId: string): Promise<{ friends: FriendRow[]; incoming: FriendRow[]; outgoing: FriendRow[] }> {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
  const others = [...new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)))];
  const visible = new Set<string>();
  for (const other of others) if (await canSeePerson(db, userId, other)) visible.add(other);
  const ids = [...visible];
  const profiles = ids.length ? await db.select().from(userProfiles).where(inArray(userProfiles.userId, ids)) : [];
  const affinities = ids.length
    ? await db
        .select({ target: userAffinities.targetUserId, score: userAffinities.score })
        .from(userAffinities)
        .where(and(eq(userAffinities.sourceUserId, userId), inArray(userAffinities.targetUserId, ids)))
    : [];
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const affinityOf = new Map(affinities.map((a) => [a.target, a.score]));
  const toRow = (other: string, requestId: string): FriendRow => {
    const p = profileOf.get(other);
    return { userId: other, displayName: p?.displayName ?? '—', countryCode: p?.countryCode ?? null, avatarUrl: p?.avatarUrl ?? null, affinity: affinityOf.get(other) ?? null, requestId };
  };
  const friends: FriendRow[] = [];
  const incoming: FriendRow[] = [];
  const outgoing: FriendRow[] = [];
  for (const r of rows) {
    const other = r.requesterId === userId ? r.addresseeId : r.requesterId;
    if (!visible.has(other)) continue;
    if (r.status === 'accepted') friends.push(toRow(other, r.id));
    else if (r.requesterId === userId) outgoing.push(toRow(other, r.id)); // pendiente o rechazada: para quien la envió, pendiente
    else if (r.status === 'pending') incoming.push(toRow(other, r.id));
  }
  const byName = (a: FriendRow, b: FriendRow) => a.displayName.localeCompare(b.displayName);
  return { friends: friends.sort(byName), incoming: incoming.sort(byName), outgoing: outgoing.sort(byName) };
}

/** Bloquear: oculta a ambas personas entre sí en todas las superficies y elimina la amistad o la solicitud. */
export async function blockUser(db: Database, userId: string, target: string, now = new Date()): Promise<void> {
  if (userId === target) throw new ForbiddenError('No puedes bloquearte');
  const [viewer] = await db.select({ dataset: users.dataset }).from(users).where(eq(users.id, userId));
  const [other] = await db.select({ dataset: users.dataset }).from(users).where(and(eq(users.id, target), isNull(users.deletedAt)));
  if (!viewer || !other || viewer.dataset !== other.dataset) throw new NotFoundError('Persona no encontrada');
  await db.transaction(async (tx) => {
    await tx.insert(userBlocks).values({ blockerUserId: userId, blockedUserId: target, createdAt: now }).onConflictDoNothing();
    await tx.delete(friendships).where(pair(userId, target));
  });
}

export async function unblockUser(db: Database, userId: string, target: string): Promise<void> {
  const deleted = await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, target)))
    .returning({ id: userBlocks.blockedUserId });
  if (!deleted.length) throw new NotFoundError('No tenías bloqueada a esa persona');
}

/** Personas que yo he bloqueado (para poder desbloquearlas). Nunca se dice quién me ha bloqueado a mí. */
export async function listBlocked(db: Database, userId: string): Promise<Array<{ userId: string; displayName: string }>> {
  const rows = await db
    .select({ userId: userBlocks.blockedUserId, displayName: userProfiles.displayName })
    .from(userBlocks)
    .leftJoin(userProfiles, eq(userProfiles.userId, userBlocks.blockedUserId))
    .where(eq(userBlocks.blockerUserId, userId));
  return rows.map((r) => ({ userId: r.userId, displayName: r.displayName ?? '—' })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'other';

/** Reportar a alguien que se puede ver (o que el propio usuario bloqueó). Opcionalmente, bloquear a la vez. */
export async function reportUser(
  db: Database,
  userId: string,
  target: string,
  input: { reason: ReportReason; note?: string; block?: boolean },
  now = new Date(),
): Promise<void> {
  const visible = await canSeePerson(db, userId, target);
  const blockedByMe = (await db.select().from(userBlocks).where(and(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, target)))).length > 0;
  if (!visible && !blockedByMe) throw new NotFoundError('Persona no encontrada');
  await db.insert(userReports).values({ reporterId: userId, reportedId: target, reason: input.reason, note: input.note?.trim() || null, createdAt: now });
  if (input.block) await blockUser(db, userId, target, now);
}
