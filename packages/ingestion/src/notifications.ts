import { catalogItems, notificationDeliveries, pushTokens, userSettings, users, type Database } from '@appinity/database';
import type { NotificationFrequency } from '@appinity/shared';
import { and, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { chatInbox } from './chat.js';
import { ConflictError } from './errors.js';
import { recommendFor } from './recommendations.js';

/**
 * Notificaciones push (fase 12C). Un resumen como mucho al día, a la hora local de la persona y según su frecuencia:
 * - `three_per_week` (por defecto): lunes, miércoles y viernes; `daily`: todos los días; `weekly`: domingo; `off`: nunca.
 * - Ventana: desde DIGEST_HOUR hasta 3 h después (si el worker estuvo parado a la hora exacta, aún se envía ese día).
 * - Contenido de evidencia vigente: recomendaciones aún no vistas y mensajes o solicitudes sin leer. Sin nada nuevo,
 *   no se envía (se registra «empty» para no volver a intentarlo ese día).
 * Ninguna notificación modifica gustos ni afinidades.
 */
export const DIGEST_HOUR = 19;
const DIGEST_WINDOW_HOURS = 3;
const DIGEST_WEEKDAYS: Record<NotificationFrequency, number[]> = {
  daily: [0, 1, 2, 3, 4, 5, 6],
  three_per_week: [1, 3, 5],
  weekly: [0],
  off: [],
};

/** Fecha (YYYY-MM-DD), día de la semana (0 = domingo) y hora en una zona horaria IANA. */
export function localParts(now: Date, timeZone: string): { date: string; weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: weekdays.indexOf(parts.weekday!), hour: Number(parts.hour) };
}

export function isDigestDue(frequency: NotificationFrequency, local: { weekday: number; hour: number }, digestHour = DIGEST_HOUR): boolean {
  return DIGEST_WEEKDAYS[frequency].includes(local.weekday) && local.hour >= digestHour && local.hour < digestHour + DIGEST_WINDOW_HOURS;
}

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[\w-]{10,}\]$/;

/** Registra (o reactiva) el token del dispositivo. Si el dispositivo cambió de cuenta, pasa a la nueva. */
export async function registerPushToken(db: Database, userId: string, token: string, platform: 'ios' | 'android', now = new Date()): Promise<void> {
  if (!EXPO_TOKEN.test(token)) throw new ConflictError('Token de notificaciones no válido');
  await db
    .insert(pushTokens)
    .values({ userId, token, platform, createdAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform, lastSeenAt: now, disabledAt: null } });
}

export async function unregisterPushToken(db: Database, userId: string, token: string): Promise<void> {
  await db.delete(pushTokens).where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; error?: string };

export type PushReceipt = { status: 'ok' } | { status: 'error'; message: string; error?: string };

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  receipts?(ids: string[]): Promise<Record<string, PushReceipt>>;
}

export interface Digest {
  recommendations: number;
  unreadChats: number;
  title: string;
  body: string;
}

const TEXT = {
  es: {
    title: 'Novedades de tus almas gemelas',
    recs: (n: number, first: string) => (n === 1 ? `Una recomendación nueva: ${first}.` : `${n} recomendaciones nuevas, como ${first}.`),
    chats: (n: number) => (n === 1 ? 'Tienes una conversación o solicitud pendiente.' : `Tienes ${n} conversaciones o solicitudes pendientes.`),
  },
  en: {
    title: 'News from your soulmates',
    recs: (n: number, first: string) => (n === 1 ? `One new recommendation: ${first}.` : `${n} new recommendations, such as ${first}.`),
    chats: (n: number) => (n === 1 ? 'You have one pending conversation or request.' : `You have ${n} pending conversations or requests.`),
  },
};

/** Resumen a partir de evidencia vigente: recomendaciones no vistas (las que Inicio marcaría como NEW) y chats. */
export async function buildDigest(db: Database, userId: string, locale: 'es' | 'en', now = new Date()): Promise<Digest> {
  const recs = await recommendFor(db, userId, { limit: 20, now, applyHomeDismissals: true });
  const fresh = recs.items.filter((i) => i.isNew);
  const [first] = fresh.length ? await db.select({ title: catalogItems.title }).from(catalogItems).where(eq(catalogItems.id, fresh[0]!.itemId)) : [];
  const inbox = await chatInbox(db, userId);
  const text = TEXT[locale];
  const parts = [...(fresh.length ? [text.recs(fresh.length, first?.title ?? '…')] : []), ...(inbox.badge ? [text.chats(inbox.badge)] : [])];
  return { recommendations: fresh.length, unreadChats: inbox.badge, title: text.title, body: parts.join(' ') };
}

export interface DigestRunResult {
  considered: number;
  sent: number;
  empty: number;
  failed: number;
}

/**
 * Envía los resúmenes que tocan. La fila de envío se reserva ANTES de enviar (índice único por persona y fecha local),
 * así que dos ejecuciones simultáneas nunca envían dos veces. Los tokens que Expo da por no registrados se desactivan.
 */
export async function sendDueDigests(db: Database, sender: PushSender, options: { now?: Date; digestHour?: number } = {}): Promise<DigestRunResult> {
  const now = options.now ?? new Date();
  const candidates = await db
    .select({ userId: users.id, timeZone: userSettings.timeZone, frequency: userSettings.notificationFrequency, locale: userSettings.locale })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(
      and(
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        ne(userSettings.notificationFrequency, 'off'),
        sql`exists (select 1 from ${pushTokens} where ${pushTokens.userId} = ${users.id} and ${pushTokens.disabledAt} is null)`,
      ),
    );
  const result: DigestRunResult = { considered: 0, sent: 0, empty: 0, failed: 0 };
  for (const user of candidates) {
    const local = localParts(now, user.timeZone);
    if (!isDigestDue(user.frequency, local, options.digestHour)) continue;
    result.considered++;
    const [claimed] = await db
      .insert(notificationDeliveries)
      .values({ userId: user.userId, kind: 'digest', localDate: local.date, status: 'failed', error: 'en curso', createdAt: now })
      .onConflictDoNothing()
      .returning({ id: notificationDeliveries.id });
    if (!claimed) continue;
    const finish = (values: Partial<typeof notificationDeliveries.$inferInsert>) =>
      db.update(notificationDeliveries).set(values).where(eq(notificationDeliveries.id, claimed.id));
    try {
      const digest = await buildDigest(db, user.userId, user.locale === 'en' ? 'en' : 'es', now);
      if (!digest.body) {
        await finish({ status: 'empty', error: null });
        result.empty++;
        continue;
      }
      const tokens = await db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(and(eq(pushTokens.userId, user.userId), isNull(pushTokens.disabledAt)));
      if (!tokens.length) {
        await finish({ status: 'no_tokens', error: null });
        continue;
      }
      const tickets = await sender.send(tokens.map((t) => ({ to: t.token, title: digest.title, body: digest.body, data: { screen: 'home' } })));
      const gone = tokens.filter((_, i) => {
        const ticket = tickets[i];
        return ticket?.status === 'error' && ticket.error === 'DeviceNotRegistered';
      });
      if (gone.length) await db.update(pushTokens).set({ disabledAt: now }).where(inArray(pushTokens.token, gone.map((t) => t.token)));
      // Cada ticket se guarda con su token («id|token») para poder desactivarlo si el recibo dice que ya no existe.
      const ok = tickets.flatMap((t, i) => (t.status === 'ok' ? [{ id: t.id, token: tokens[i]!.token }] : []));
      await finish({
        status: ok.length ? 'sent' : 'failed',
        recommendations: digest.recommendations,
        unreadChats: digest.unreadChats,
        tickets: ok.map((t) => `${t.id}|${t.token}`),
        error: ok.length ? null : (tickets.find((t) => t.status === 'error') as { message?: string } | undefined)?.message?.slice(0, 200) ?? 'sin tickets',
      });
      if (ok.length) result.sent++;
      else result.failed++;
    } catch (error) {
      await finish({ status: 'failed', error: (error as Error).message.slice(0, 200) });
      result.failed++;
    }
  }
  return result;
}

/**
 * Recibos de Expo (~15 min después del envío y antes de que caduquen a las 24 h): confirman si FCM/APNs aceptaron
 * cada notificación. DeviceNotRegistered desactiva el token. Se anota cuántos fallaron; un envío solo cuenta como
 * entregado al proveedor con recibo «ok».
 */
export async function checkDigestReceipts(db: Database, sender: PushSender, options: { now?: Date } = {}): Promise<{ checked: number; errors: number }> {
  if (!sender.receipts) return { checked: 0, errors: 0 };
  const now = options.now ?? new Date();
  const pending = await db
    .select({ id: notificationDeliveries.id, tickets: notificationDeliveries.tickets })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.status, 'sent'),
        isNull(notificationDeliveries.receiptsCheckedAt),
        lt(notificationDeliveries.createdAt, new Date(now.getTime() - 15 * 60_000)),
        gt(notificationDeliveries.createdAt, new Date(now.getTime() - 23 * 3600_000)),
      ),
    );
  if (!pending.length) return { checked: 0, errors: 0 };
  const pairs = pending.flatMap((d) => d.tickets.map((t) => ({ delivery: d.id, id: t.split('|')[0]!, token: t.split('|')[1] ?? '' })));
  const receipts = await sender.receipts(pairs.map((p) => p.id));
  const gone = pairs.filter((p) => {
    const r = receipts[p.id];
    return r?.status === 'error' && r.error === 'DeviceNotRegistered';
  });
  if (gone.length) await db.update(pushTokens).set({ disabledAt: now }).where(inArray(pushTokens.token, gone.map((p) => p.token)));
  let errors = 0;
  let checked = 0;
  for (const delivery of pending) {
    const mine = pairs.filter((p) => p.delivery === delivery.id);
    // Recibos aún no disponibles: se vuelve a mirar en la siguiente pasada (como mucho hasta las 23 h).
    if (mine.some((p) => !receipts[p.id])) continue;
    const failed = mine.filter((p) => receipts[p.id]?.status === 'error').length;
    errors += failed;
    await db.update(notificationDeliveries).set({ receiptsCheckedAt: now, receiptErrors: failed }).where(eq(notificationDeliveries.id, delivery.id));
    checked++;
  }
  return { checked, errors };
}
