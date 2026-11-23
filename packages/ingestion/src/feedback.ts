import { feedback, userProfiles, users, type Database } from '@appinity/database';
import { FEEDBACK_PER_DAY, type FeedbackDto } from '@appinity/shared';
import { and, count, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { RateLimitedError } from './errors.js';

/**
 * Comentarios de la beta (fase B5). Los envía una persona con sesión desde Perfil → «Enviar comentario»; se guardan con
 * la versión y la plataforma de la app, nada más. Cupo: FEEDBACK_PER_DAY en 24 horas por persona.
 */
export async function submitFeedback(db: Database, userId: string, input: FeedbackDto, now = new Date()): Promise<{ id: string }> {
  const [sent] = await db
    .select({ n: count() })
    .from(feedback)
    .where(and(eq(feedback.userId, userId), gte(feedback.createdAt, new Date(now.getTime() - 24 * 3600_000))));
  if ((sent?.n ?? 0) >= FEEDBACK_PER_DAY) {
    throw new RateLimitedError(`Has enviado ${FEEDBACK_PER_DAY} comentarios hoy. Gracias: vuelve a intentarlo mañana.`);
  }
  const [row] = await db
    .insert(feedback)
    .values({ userId, message: input.message.trim(), appVersion: input.appVersion, platform: input.platform, createdAt: now })
    .returning({ id: feedback.id });
  return { id: row!.id };
}

export interface FeedbackEntry {
  id: string;
  createdAt: Date;
  readAt: Date | null;
  handle: string;
  displayName: string | null;
  dataset: 'demo' | 'live';
  appVersion: string;
  platform: 'android' | 'ios' | 'web';
  message: string;
}

/** Comentarios más recientes primero; por defecto, solo los no leídos. Para el titular (`pnpm feedback:list`). */
export async function listFeedback(db: Database, options: { includeRead?: boolean; limit?: number } = {}): Promise<FeedbackEntry[]> {
  const rows = await db
    .select({
      id: feedback.id,
      createdAt: feedback.createdAt,
      readAt: feedback.readAt,
      handle: users.handle,
      displayName: userProfiles.displayName,
      dataset: users.dataset,
      appVersion: feedback.appVersion,
      platform: feedback.platform,
      message: feedback.message,
    })
    .from(feedback)
    .innerJoin(users, eq(users.id, feedback.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, feedback.userId))
    .where(options.includeRead ? undefined : isNull(feedback.readAt))
    .orderBy(desc(feedback.createdAt))
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 500));
  return rows;
}

/** Marca como leídos los comentarios indicados; devuelve cuántos cambiaron. */
export async function markFeedbackRead(db: Database, ids: string[], now = new Date()): Promise<number> {
  if (!ids.length) return 0;
  const updated = await db
    .update(feedback)
    .set({ readAt: now })
    .where(and(inArray(feedback.id, ids), isNull(feedback.readAt)))
    .returning({ id: feedback.id });
  return updated.length;
}

/** Cuántos comentarios hay sin leer (resumen del comando). */
export async function countUnreadFeedback(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(feedback).where(isNull(feedback.readAt));
  return row?.n ?? 0;
}
