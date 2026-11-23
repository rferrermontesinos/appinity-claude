import { authSessions, userProfiles, userReports, users, type Database } from '@appinity/database';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ConflictError, NotFoundError } from './errors.js';
import type { ReportReason } from './social.js';

/**
 * Moderación de la beta (fase B9), por comando y para el titular: revisar los reportes que envía la gente desde la app y
 * suspender una cuenta. Una cuenta suspendida no puede entrar ni usar la API, y desaparece para los demás en todas
 * partes (almas gemelas, personas, chat, amistades, Trending y afinidades), porque todas exigen `status = 'active'`.
 * Sus datos se conservan: al levantar la suspensión, todo vuelve como estaba.
 */

export interface ReportEntry {
  id: string;
  reason: ReportReason;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reporterHandle: string;
}

export interface ReportedPerson {
  userId: string;
  handle: string;
  displayName: string | null;
  dataset: 'demo' | 'live';
  status: 'active' | 'suspended' | 'deleted';
  suspendedAt: Date | null;
  /** Los más recientes primero. */
  reports: ReportEntry[];
}

/** Reportes agrupados por persona reportada, la del más reciente primero. Por defecto, solo los pendientes. */
export async function listReports(db: Database, options: { includeReviewed?: boolean; limit?: number } = {}): Promise<ReportedPerson[]> {
  const reporter = alias(users, 'reporter');
  const rows = await db
    .select({
      id: userReports.id,
      reason: userReports.reason,
      note: userReports.note,
      createdAt: userReports.createdAt,
      reviewedAt: userReports.reviewedAt,
      reporterHandle: reporter.handle,
      userId: users.id,
      handle: users.handle,
      displayName: userProfiles.displayName,
      dataset: users.dataset,
      status: users.status,
      suspendedAt: users.suspendedAt,
    })
    .from(userReports)
    .innerJoin(users, eq(users.id, userReports.reportedId))
    .innerJoin(reporter, eq(reporter.id, userReports.reporterId))
    .leftJoin(userProfiles, eq(userProfiles.userId, userReports.reportedId))
    .where(options.includeReviewed ? undefined : isNull(userReports.reviewedAt))
    .orderBy(desc(userReports.createdAt), desc(userReports.id))
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 500));
  const people = new Map<string, ReportedPerson>();
  for (const row of rows) {
    const person = people.get(row.userId) ?? {
      userId: row.userId,
      handle: row.handle,
      displayName: row.displayName,
      dataset: row.dataset,
      status: row.status,
      suspendedAt: row.suspendedAt,
      reports: [],
    };
    person.reports.push({
      id: row.id,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
      reporterHandle: row.reporterHandle,
    });
    people.set(row.userId, person);
  }
  return [...people.values()];
}

/** Marca como revisados los reportes indicados; devuelve cuántos cambiaron. */
export async function markReportsReviewed(db: Database, ids: string[], now = new Date()): Promise<number> {
  if (!ids.length) return 0;
  const updated = await db
    .update(userReports)
    .set({ reviewedAt: now })
    .where(and(inArray(userReports.id, ids), isNull(userReports.reviewedAt)))
    .returning({ id: userReports.id });
  return updated.length;
}

export async function countPendingReports(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(userReports).where(isNull(userReports.reviewedAt));
  return row?.n ?? 0;
}

export interface ModerationTarget {
  userId: string;
  handle: string;
  displayName: string | null;
  dataset: 'demo' | 'live';
  status: 'active' | 'suspended' | 'deleted';
  suspendedAt: Date | null;
  pendingReports: number;
}

/** La cuenta por su handle (el que enseña `pnpm reports:list`), con sus reportes pendientes. */
export async function findModerationTarget(db: Database, handle: string): Promise<ModerationTarget> {
  const [row] = await db
    .select({
      userId: users.id,
      handle: users.handle,
      displayName: userProfiles.displayName,
      dataset: users.dataset,
      status: users.status,
      suspendedAt: users.suspendedAt,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.handle, handle.trim().replace(/^@/, '')));
  if (!row) throw new NotFoundError(`No hay ninguna cuenta @${handle.trim().replace(/^@/, '')}`);
  const [pending] = await db
    .select({ n: count() })
    .from(userReports)
    .where(and(eq(userReports.reportedId, row.userId), isNull(userReports.reviewedAt)));
  return { ...row, pendingReports: pending?.n ?? 0 };
}

/**
 * Suspende la cuenta y cierra todas sus sesiones al momento. Sus datos se conservan para poder revisarlos o levantar
 * la suspensión; borrarla del todo es otra cosa (`pnpm account:delete`).
 */
export async function suspendUser(db: Database, userId: string, now = new Date()): Promise<{ sessionsRevoked: number }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ status: 'suspended', suspendedAt: now, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .returning({ id: users.id });
    if (!user) throw new ConflictError('La cuenta no está activa (ya suspendida o eliminada)');
    const sessions = await tx
      .update(authSessions)
      .set({ revokedAt: now })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return { sessionsRevoked: sessions.length };
  });
}

/** Levanta la suspensión: la persona vuelve a entrar con Google y reaparece para los demás. */
export async function unsuspendUser(db: Database, userId: string, now = new Date()): Promise<void> {
  const [user] = await db
    .update(users)
    .set({ status: 'active', suspendedAt: null, updatedAt: now })
    .where(and(eq(users.id, userId), eq(users.status, 'suspended')))
    .returning({ id: users.id });
  if (!user) throw new ConflictError('La cuenta no está suspendida');
}
