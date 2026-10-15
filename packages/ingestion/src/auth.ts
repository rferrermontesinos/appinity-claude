import { authIdentities, authSessions, userProfiles, userSettings, users, type Database } from '@appinity/database';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { NotFoundError } from './errors.js';

/**
 * Identidad y sesiones de producción (fase 13). La API verifica la identidad externa (ID token de OpenID Connect) y
 * llama aquí con el sujeto ya verificado. Las cuentas creadas así son siempre reales (dataset `live`): nunca se
 * mezclan con las personas sintéticas de la demo.
 */
export const SESSION_TTL_DAYS = 90;

export interface VerifiedIdentity {
  provider: 'google' | 'apple';
  subject: string;
  /** Solo si el proveedor lo dio verificado. */
  email?: string;
  name?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

async function uniqueHandle(db: Database): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const handle = `u_${randomBytes(6).toString('hex')}`;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle));
    if (!taken) return handle;
  }
  throw new Error('No se pudo generar un identificador de usuario');
}

/** Devuelve el usuario de esa identidad o crea uno nuevo (sin mayoría de edad ni condiciones aceptadas todavía). */
export async function findOrCreateUserForIdentity(
  db: Database,
  identity: VerifiedIdentity,
  now = new Date(),
): Promise<{ userId: string; isNew: boolean }> {
  const [existing] = await db
    .select({ userId: authIdentities.userId, id: authIdentities.id, status: users.status, deletedAt: users.deletedAt })
    .from(authIdentities)
    .innerJoin(users, eq(users.id, authIdentities.userId))
    .where(and(eq(authIdentities.provider, identity.provider), eq(authIdentities.subject, identity.subject)));
  if (existing) {
    if (existing.status !== 'active' || existing.deletedAt) throw new NotFoundError('Esta cuenta no está activa');
    await db
      .update(authIdentities)
      .set({ lastLoginAt: now, ...(identity.email ? { email: identity.email } : {}) })
      .where(eq(authIdentities.id, existing.id));
    return { userId: existing.userId, isNew: false };
  }
  const handle = await uniqueHandle(db);
  const displayName = (identity.name ?? '').trim().slice(0, 60) || handle;
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ handle, dataset: 'live', createdAt: now, updatedAt: now }).returning({ id: users.id });
    await tx.insert(userProfiles).values({ userId: user!.id, displayName });
    await tx.insert(userSettings).values({ userId: user!.id });
    await tx.insert(authIdentities).values({
      userId: user!.id,
      provider: identity.provider,
      subject: identity.subject,
      ...(identity.email ? { email: identity.email } : {}),
      createdAt: now,
      lastLoginAt: now,
    });
    return user!.id;
  });
  return { userId, isNew: true };
}

/** Nueva sesión: el refresh token se devuelve una sola vez y solo se guarda su hash. */
export async function createSession(db: Database, userId: string, now = new Date()): Promise<{ sessionId: string; refreshToken: string; expiresAt: Date }> {
  const refreshToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 3600_000);
  const [session] = await db
    .insert(authSessions)
    .values({ userId, refreshTokenHash: sha256(refreshToken), createdAt: now, lastUsedAt: now, expiresAt })
    .returning({ id: authSessions.id });
  return { sessionId: session!.id, refreshToken, expiresAt };
}

/** Renueva la sesión: el refresh token usado deja de valer (rotación) y se entrega otro. */
export async function rotateSession(
  db: Database,
  refreshToken: string,
  now = new Date(),
): Promise<{ userId: string; sessionId: string; refreshToken: string; expiresAt: Date }> {
  const next = randomBytes(32).toString('base64url');
  const [session] = await db
    .update(authSessions)
    .set({ refreshTokenHash: sha256(next), lastUsedAt: now })
    .where(and(eq(authSessions.refreshTokenHash, sha256(refreshToken)), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now)))
    .returning({ id: authSessions.id, userId: authSessions.userId, expiresAt: authSessions.expiresAt });
  if (!session) throw new NotFoundError('Sesión no válida o caducada');
  return { userId: session.userId, sessionId: session.id, refreshToken: next, expiresAt: session.expiresAt };
}

/** ¿Sigue vigente la sesión de un access token? (cierre de sesión y eliminación de cuenta surten efecto al momento). */
export async function sessionIsActive(db: Database, sessionId: string, userId: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now)));
  return Boolean(row);
}

export async function revokeSession(db: Database, sessionId: string, userId: string, now = new Date()): Promise<void> {
  await db.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)));
}

/**
 * Alta (único momento de consentimiento): mayoría de edad y condiciones. Sin ambas, la persona no aparece para nadie
 * (las superficies sociales exigen `adult_confirmed_at`).
 */
export async function completeOnboarding(
  db: Database,
  userId: string,
  input: { adult: boolean; termsAccepted: boolean; displayName?: string },
  now = new Date(),
): Promise<void> {
  if (!input.adult || !input.termsAccepted) throw new NotFoundError('Hay que confirmar la mayoría de edad y aceptar las condiciones');
  await db.update(users).set({ adultConfirmedAt: now, termsAcceptedAt: now, updatedAt: now }).where(eq(users.id, userId));
  const name = input.displayName?.trim().slice(0, 60);
  if (name) await db.update(userProfiles).set({ displayName: name }).where(eq(userProfiles.userId, userId));
}
