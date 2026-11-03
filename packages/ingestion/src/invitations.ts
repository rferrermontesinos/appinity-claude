import { friendships, invitations, userProfiles, type Database } from '@appinity/database';
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { openMatch } from './chat.js';
import { NotFoundError } from './errors.js';
import { canSeePerson } from './soulmates.js';
import { followEachOther } from './follows.js';

/**
 * Invitaciones por enlace (crecimiento por grupos, 2026-10-22). Un código aleatorio de 10 caracteres (≈ 50 bits) que
 * caduca a los 30 días y admite 20 usos. Aceptar crea la amistad (y abre el chat, como cualquier amistad aceptada):
 * compartir el enlace es el consentimiento de quien invita y aceptarlo, el de quien lo recibe. Respeta los bloqueos y
 * el aislamiento por dataset. Nada de esto toca gustos ni afinidades.
 */
export const INVITATION_DAYS = 30;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function newCode(): string {
  const bytes = randomBytes(10);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const isUsable = (now: Date) => and(isNull(invitations.revokedAt), gt(invitations.expiresAt, now), lt(invitations.uses, invitations.maxUses));

/** Devuelve la invitación vigente de la persona o crea una. */
export async function createInvitation(db: Database, inviterId: string, now = new Date()): Promise<{ code: string; expiresAt: Date }> {
  const [current] = await db
    .select({ code: invitations.code, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(eq(invitations.inviterId, inviterId), isUsable(now), gt(invitations.expiresAt, new Date(now.getTime() + 7 * 86_400_000))));
  if (current) return current;
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 86_400_000);
  const [row] = await db.insert(invitations).values({ code: newCode(), inviterId, expiresAt, createdAt: now }).returning({ code: invitations.code, expiresAt: invitations.expiresAt });
  return row!;
}

async function usableInvitation(db: Database, code: string, viewerId: string, now: Date) {
  const [row] = await db.select().from(invitations).where(and(eq(invitations.code, code.trim().toLowerCase()), isUsable(now)));
  // Caducada, revocada, agotada, propia o de alguien que no se puede ver (bloqueo u otro dataset): no existe.
  if (!row || row.inviterId === viewerId || !(await canSeePerson(db, viewerId, row.inviterId))) throw new NotFoundError('Invitación no válida o caducada');
  return row;
}

/** Lo mínimo para decidir: quién invita (nombre visible). */
export async function previewInvitation(db: Database, code: string, viewerId: string, now = new Date()): Promise<{ inviterId: string; inviterName: string }> {
  const row = await usableInvitation(db, code, viewerId, now);
  const [profile] = await db.select({ name: userProfiles.displayName }).from(userProfiles).where(eq(userProfiles.userId, row.inviterId));
  return { inviterId: row.inviterId, inviterName: profile?.name ?? '—' };
}

export async function acceptInvitation(db: Database, code: string, viewerId: string, now = new Date()): Promise<{ inviterId: string; state: 'friends' }> {
  const row = await usableInvitation(db, code, viewerId, now);
  await db.transaction(async (tx) => {
    const pair = or(
      and(eq(friendships.requesterId, row.inviterId), eq(friendships.addresseeId, viewerId)),
      and(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, row.inviterId)),
    );
    const [existing] = await tx.select().from(friendships).where(pair);
    if (existing?.status === 'accepted') return;
    if (existing) await tx.update(friendships).set({ requesterId: row.inviterId, addresseeId: viewerId, status: 'accepted', respondedAt: now }).where(eq(friendships.id, existing.id));
    else await tx.insert(friendships).values({ requesterId: row.inviterId, addresseeId: viewerId, status: 'accepted', createdAt: now, respondedAt: now });
    await openMatch(tx, viewerId, row.inviterId, 'friendship', now, viewerId);
    await followEachOther(tx, viewerId, row.inviterId, now);
    await tx.update(invitations).set({ uses: sql`${invitations.uses} + 1` }).where(eq(invitations.id, row.id));
  });
  return { inviterId: row.inviterId, state: 'friends' };
}
