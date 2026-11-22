import {
  conversationMembers,
  conversations,
  messageRequests,
  messages,
  userAffinities,
  userProfiles,
  type Database,
} from '@appinity/database';
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError } from './errors.js';
import { canSeePerson } from './soulmates.js';

/**
 * Chat (§16, fase 12A) con modelo «match», como en Tinder:
 *
 * 1. Una persona muestra interés por hablar con otra (EARLY_ACCESS, gratis, sin texto) o, si es Premium y el flag
 *    PREMIUM_DIRECT_MESSAGE está activo, le envía directamente el primer mensaje.
 * 2. La otra persona acepta (o responde), ignora, bloquea o reporta. Si ambas muestran interés, hay match inmediato.
 *    Una amistad aceptada también abre el chat.
 * 3. Con el match se abre la conversación. Solo hay mensajes dentro de una conversación activa.
 *
 * Ignorar no se revela ni genera señales. Nada aquí lee ni escribe gustos, preferencias ni afinidades (solo se
 * muestran las ya calculadas). Toda operación parte del usuario de la sesión y comprueba que puede ver a la otra persona.
 */
export interface ChatPolicy {
  /** EARLY_ACCESS: chat gratuito con solicitud y aceptación. */
  earlyAccess: boolean;
  /** PREMIUM_DIRECT_MESSAGE: Premium puede enviar el primer mensaje sin aceptación previa. */
  premiumDirectMessage: boolean;
  /** Entitlement Premium verificado en servidor. Sin RevenueCat (fase 12B) siempre es falso en la API. */
  isPremium: (userId: string) => Promise<boolean> | boolean;
}

export const CHAT_LIMITS = {
  /** Solicitudes (interés o mensaje directo) nuevas por persona y 24 h. */
  requestsPerDay: 30,
  messagesPerMinute: 20,
  messagesPerDay: 500,
  bodyMaxLength: 1000,
  pageSize: 50,
} as const;

export type ChatState =
  | { state: 'none' }
  /** Enviada (pendiente o ignorada: quien la envió no lo sabe). */
  | { state: 'request_sent'; kind: 'interest' | 'direct' }
  | { state: 'request_received'; requestId: string; kind: 'interest' | 'direct'; firstMessage: string | null }
  | { state: 'matched'; conversationId: string };

export interface MatchResult {
  state: ChatState['state'];
  conversationId: string | null;
  /** Se acaba de producir el match (la app muestra «¡Es un match!»). */
  newMatch: boolean;
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Db = Database | Tx;

const ordered = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const otherOf = (c: { userLow: string; userHigh: string }, me: string) => (c.userLow === me ? c.userHigh : c.userLow);

function cleanBody(body: string): string {
  const text = body.trim();
  if (!text) throw new ConflictError('El mensaje está vacío');
  if (text.length > CHAT_LIMITS.bodyMaxLength) throw new ConflictError(`El mensaje supera ${CHAT_LIMITS.bodyMaxLength} caracteres`);
  return text;
}

async function conversationOfPair(db: Db, a: string, b: string) {
  const [low, high] = ordered(a, b);
  const [row] = await db.select().from(conversations).where(and(eq(conversations.userLow, low), eq(conversations.userHigh, high)));
  return row ?? null;
}

async function requestBetween(db: Db, sender: string, recipient: string) {
  const [row] = await db
    .select()
    .from(messageRequests)
    .where(and(eq(messageRequests.senderId, sender), eq(messageRequests.recipientId, recipient)));
  return row ?? null;
}

/**
 * Abre (o reabre) la conversación de una pareja. Si estaba cerrada (match deshecho o bloqueo levantado), se vacía:
 * un match nuevo no recupera mensajes antiguos. `actor` es quien provoca el match y ya ve el aviso.
 */
export async function openMatch(
  db: Db,
  a: string,
  b: string,
  origin: 'request' | 'mutual' | 'friendship' | 'direct',
  now: Date,
  actor?: string,
): Promise<{ conversationId: string; created: boolean }> {
  const [low, high] = ordered(a, b);
  const existing = await conversationOfPair(db, a, b);
  let conversationId: string;
  if (existing?.status === 'active') return { conversationId: existing.id, created: false };
  if (existing) {
    await db.delete(messages).where(eq(messages.conversationId, existing.id));
    await db
      .update(conversations)
      .set({ status: 'active', origin, matchedAt: now, lastMessageAt: null, closedAt: null })
      .where(eq(conversations.id, existing.id));
    await db.delete(conversationMembers).where(eq(conversationMembers.conversationId, existing.id));
    conversationId = existing.id;
  } else {
    const [row] = await db.insert(conversations).values({ userLow: low, userHigh: high, origin, matchedAt: now }).returning({ id: conversations.id });
    conversationId = row!.id;
  }
  await db.insert(conversationMembers).values([
    { conversationId, userId: low, matchSeenAt: actor === low ? now : null },
    { conversationId, userId: high, matchSeenAt: actor === high ? now : null },
  ]);
  return { conversationId, created: true };
}

/** Cierra la conversación de la pareja (bloqueo) y borra las solicitudes en ambos sentidos. */
export async function closeChatForBlock(db: Db, a: string, b: string, now: Date): Promise<void> {
  const [low, high] = ordered(a, b);
  await db
    .update(conversations)
    .set({ status: 'closed', closedAt: now })
    .where(and(eq(conversations.userLow, low), eq(conversations.userHigh, high), eq(conversations.status, 'active')));
  await db
    .delete(messageRequests)
    .where(
      or(
        and(eq(messageRequests.senderId, a), eq(messageRequests.recipientId, b)),
        and(eq(messageRequests.senderId, b), eq(messageRequests.recipientId, a)),
      ),
    );
}

/** Relación de chat vista por `viewer`. */
export async function chatState(db: Database, viewer: string, other: string): Promise<ChatState> {
  const conversation = await conversationOfPair(db, viewer, other);
  if (conversation?.status === 'active') return { state: 'matched', conversationId: conversation.id };
  const incoming = await requestBetween(db, other, viewer);
  if (incoming?.status === 'pending') {
    return { state: 'request_received', requestId: incoming.id, kind: incoming.kind, firstMessage: incoming.firstMessage };
  }
  const outgoing = await requestBetween(db, viewer, other);
  if (outgoing && outgoing.status !== 'accepted') return { state: 'request_sent', kind: outgoing.kind };
  return { state: 'none' };
}

async function assertRequestQuota(db: Database, userId: string, now: Date) {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [row] = await db
    .select({ n: count() })
    .from(messageRequests)
    .where(and(eq(messageRequests.senderId, userId), gte(messageRequests.createdAt, since)));
  if ((row?.n ?? 0) >= CHAT_LIMITS.requestsPerDay) throw new RateLimitedError('Has enviado demasiadas solicitudes hoy. Prueba mañana.');
}

async function assertMessageQuota(db: Database, userId: string, now: Date) {
  const [minute] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.senderId, userId), gte(messages.createdAt, new Date(now.getTime() - 60_000))));
  if ((minute?.n ?? 0) >= CHAT_LIMITS.messagesPerMinute) throw new RateLimitedError('Estás enviando mensajes demasiado rápido.');
  const [day] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.senderId, userId), gte(messages.createdAt, new Date(now.getTime() - 24 * 3600_000))));
  if ((day?.n ?? 0) >= CHAT_LIMITS.messagesPerDay) throw new RateLimitedError('Has alcanzado el límite diario de mensajes.');
}

/** Si la otra persona ya había mostrado interés (aunque lo ignorase yo antes), el interés mutuo es un match. */
async function matchIfMutual(db: Database, from: string, to: string, now: Date, origin: 'mutual' | 'direct'): Promise<string | null> {
  const reverse = await requestBetween(db, to, from);
  if (!reverse || reverse.status === 'accepted') return null;
  return db.transaction(async (tx) => {
    await tx.update(messageRequests).set({ status: 'accepted', respondedAt: now }).where(eq(messageRequests.id, reverse.id));
    const { conversationId } = await openMatch(tx, from, to, origin, now, from);
    if (reverse.kind === 'direct' && reverse.firstMessage) {
      await tx.insert(messages).values({ conversationId, senderId: to, body: reverse.firstMessage, createdAt: reverse.createdAt });
      await tx.update(conversations).set({ lastMessageAt: reverse.createdAt }).where(eq(conversations.id, conversationId));
    }
    return conversationId;
  });
}

/** Interés por hablar (EARLY_ACCESS). Si es mutuo, match inmediato. */
export async function sendChatInterest(db: Database, policy: ChatPolicy, from: string, to: string, now = new Date()): Promise<MatchResult> {
  if (!policy.earlyAccess) throw new ForbiddenError('El chat todavía no está disponible');
  if (!(await canSeePerson(db, from, to))) throw new NotFoundError('Persona no encontrada');
  const conversation = await conversationOfPair(db, from, to);
  if (conversation?.status === 'active') return { state: 'matched', conversationId: conversation.id, newMatch: false };
  const mutual = await matchIfMutual(db, from, to, now, 'mutual');
  if (mutual) return { state: 'matched', conversationId: mutual, newMatch: true };
  const own = await requestBetween(db, from, to);
  // Ya enviada (o ignorada sin que se sepa): no se duplica ni se insiste.
  if (own && own.status !== 'accepted') return { state: 'request_sent', conversationId: null, newMatch: false };
  await assertRequestQuota(db, from, now);
  if (own) {
    await db
      .update(messageRequests)
      .set({ kind: 'interest', status: 'pending', firstMessage: null, createdAt: now, respondedAt: null })
      .where(eq(messageRequests.id, own.id));
  } else {
    await db.insert(messageRequests).values({ senderId: from, recipientId: to, kind: 'interest', createdAt: now });
  }
  return { state: 'request_sent', conversationId: null, newMatch: false };
}

/** Primer mensaje directo (PREMIUM_DIRECT_MESSAGE). El entitlement se comprueba en servidor. */
export async function sendDirectMessage(
  db: Database,
  policy: ChatPolicy,
  from: string,
  to: string,
  body: string,
  now = new Date(),
): Promise<MatchResult> {
  if (!policy.premiumDirectMessage || !(await policy.isPremium(from))) throw new ForbiddenError('Necesitas Premium para escribir sin match');
  const text = cleanBody(body);
  if (!(await canSeePerson(db, from, to))) throw new NotFoundError('Persona no encontrada');
  const conversation = await conversationOfPair(db, from, to);
  if (conversation?.status === 'active') {
    await sendMessage(db, from, conversation.id, text, undefined, now);
    return { state: 'matched', conversationId: conversation.id, newMatch: false };
  }
  const mutual = await matchIfMutual(db, from, to, now, 'direct');
  if (mutual) {
    await sendMessage(db, from, mutual, text, undefined, now);
    return { state: 'matched', conversationId: mutual, newMatch: true };
  }
  const own = await requestBetween(db, from, to);
  // Un único mensaje sin respuesta: no se puede insistir.
  if (own?.kind === 'direct' && own.status !== 'accepted') throw new ConflictError('Espera a que responda');
  await assertRequestQuota(db, from, now);
  if (own) {
    await db
      .update(messageRequests)
      .set({ kind: 'direct', status: 'pending', firstMessage: text, createdAt: now, respondedAt: null })
      .where(eq(messageRequests.id, own.id));
  } else {
    await db.insert(messageRequests).values({ senderId: from, recipientId: to, kind: 'direct', firstMessage: text, createdAt: now });
  }
  return { state: 'request_sent', conversationId: null, newMatch: false };
}

/** Aceptar (match) o ignorar una solicitud recibida. Solo quien la recibe puede responderla. */
export async function respondChatRequest(
  db: Database,
  userId: string,
  requestId: string,
  action: 'accept' | 'ignore',
  now = new Date(),
): Promise<MatchResult> {
  const [row] = await db.select().from(messageRequests).where(eq(messageRequests.id, requestId));
  if (!row || row.recipientId !== userId || row.status !== 'pending') throw new NotFoundError('Solicitud no encontrada');
  if (!(await canSeePerson(db, userId, row.senderId))) throw new NotFoundError('Persona no encontrada');
  if (action === 'ignore') {
    // Sin señales: ni afinidad, ni gustos, ni aviso a quien la envió.
    await db.update(messageRequests).set({ status: 'ignored', respondedAt: now }).where(eq(messageRequests.id, row.id));
    return { state: 'none', conversationId: null, newMatch: false };
  }
  const conversationId = await db.transaction(async (tx) => {
    await tx.update(messageRequests).set({ status: 'accepted', respondedAt: now }).where(eq(messageRequests.id, row.id));
    const opened = await openMatch(tx, userId, row.senderId, row.kind === 'direct' ? 'direct' : 'request', now, userId);
    if (row.kind === 'direct' && row.firstMessage) {
      await tx.insert(messages).values({ conversationId: opened.conversationId, senderId: row.senderId, body: row.firstMessage, createdAt: row.createdAt });
      await tx.update(conversations).set({ lastMessageAt: row.createdAt }).where(eq(conversations.id, opened.conversationId));
    }
    return opened.conversationId;
  });
  return { state: 'matched', conversationId, newMatch: true };
}

/** Conversación activa de la que `userId` es miembro y cuya otra persona puede ver; si no, 404. */
async function memberConversation(db: Database, userId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.status, 'active'), or(eq(conversations.userLow, userId), eq(conversations.userHigh, userId))));
  if (!row) throw new NotFoundError('Conversación no encontrada');
  const other = otherOf(row, userId);
  if (!(await canSeePerson(db, userId, other))) throw new NotFoundError('Conversación no encontrada');
  return { conversation: row, other };
}

export interface MessageRow {
  id: string;
  senderId: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

const toMessage = (m: typeof messages.$inferSelect, me: string): MessageRow => ({
  id: m.id,
  senderId: m.senderId,
  mine: m.senderId === me,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

export async function sendMessage(
  db: Database,
  userId: string,
  conversationId: string,
  body: string,
  clientId?: string,
  now = new Date(),
): Promise<MessageRow> {
  const text = cleanBody(body);
  const { conversation } = await memberConversation(db, userId, conversationId);
  if (clientId) {
    // Reintento del mismo envío: se devuelve el mensaje ya guardado.
    const [dup] = await db.select().from(messages).where(and(eq(messages.senderId, userId), eq(messages.clientId, clientId)));
    if (dup) return toMessage(dup, userId);
  }
  await assertMessageQuota(db, userId, now);
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({ conversationId: conversation.id, senderId: userId, body: text, clientId: clientId ?? null, createdAt: now })
      .returning();
    await tx.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversation.id));
    await tx
      .update(conversationMembers)
      .set({ lastReadAt: now, matchSeenAt: sql`coalesce(${conversationMembers.matchSeenAt}, ${now})` })
      .where(and(eq(conversationMembers.conversationId, conversation.id), eq(conversationMembers.userId, userId)));
    return inserted!;
  });
  return toMessage(row, userId);
}

export interface ChatPersonRow {
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarUrl: string | null;
  affinity: number | null;
}

async function peopleRows(db: Database, viewer: string, ids: string[]): Promise<Map<string, ChatPersonRow>> {
  if (!ids.length) return new Map();
  const profiles = await db.select().from(userProfiles).where(inArray(userProfiles.userId, ids));
  const affinities = await db
    .select({ target: userAffinities.targetUserId, score: userAffinities.score })
    .from(userAffinities)
    .where(and(eq(userAffinities.sourceUserId, viewer), inArray(userAffinities.targetUserId, ids)));
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const affinityOf = new Map(affinities.map((a) => [a.target, a.score]));
  return new Map(
    ids.map((id) => {
      const p = profileOf.get(id);
      return [id, { userId: id, displayName: p?.displayName ?? '—', countryCode: p?.countryCode ?? null, avatarUrl: p?.avatarUrl ?? null, affinity: affinityOf.get(id) ?? null }];
    }),
  );
}

export interface ConversationPage {
  conversation: { id: string; origin: string; matchedAt: string; person: ChatPersonRow; otherLastReadAt: string | null };
  messages: MessageRow[];
  hasMore: boolean;
}

/** Mensajes en orden cronológico; `before` pagina hacia atrás. */
export async function conversationMessages(
  db: Database,
  userId: string,
  conversationId: string,
  options: { before?: Date; limit?: number } = {},
): Promise<ConversationPage> {
  const { conversation, other } = await memberConversation(db, userId, conversationId);
  const limit = Math.min(Math.max(options.limit ?? CHAT_LIMITS.pageSize, 1), 100);
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversation.id), options.before ? lt(messages.createdAt, options.before) : undefined))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);
  const [otherMember] = await db
    .select({ lastReadAt: conversationMembers.lastReadAt })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversation.id), eq(conversationMembers.userId, other)));
  const person = (await peopleRows(db, userId, [other])).get(other)!;
  return {
    conversation: {
      id: conversation.id,
      origin: conversation.origin,
      matchedAt: conversation.matchedAt.toISOString(),
      person,
      otherLastReadAt: otherMember?.lastReadAt?.toISOString() ?? null,
    },
    messages: rows.slice(0, limit).reverse().map((m) => toMessage(m, userId)),
    hasMore: rows.length > limit,
  };
}

/** Marca como leído (y el aviso de match como visto). */
export async function markConversationRead(db: Database, userId: string, conversationId: string, now = new Date()): Promise<void> {
  const { conversation } = await memberConversation(db, userId, conversationId);
  await db
    .update(conversationMembers)
    .set({ lastReadAt: now, matchSeenAt: sql`coalesce(${conversationMembers.matchSeenAt}, ${now})` })
    .where(and(eq(conversationMembers.conversationId, conversation.id), eq(conversationMembers.userId, userId)));
}

/**
 * Deshacer el match: la conversación desaparece para ambas personas. Quien lo deshace puede volver a mostrar interés;
 * la otra persona no puede insistir (su solicitud queda como ignorada, sin aviso).
 */
export async function unmatch(db: Database, userId: string, conversationId: string, now = new Date()): Promise<void> {
  const { conversation, other } = await memberConversation(db, userId, conversationId);
  await db.transaction(async (tx) => {
    await tx.update(conversations).set({ status: 'closed', closedAt: now }).where(eq(conversations.id, conversation.id));
    await tx.delete(messageRequests).where(and(eq(messageRequests.senderId, userId), eq(messageRequests.recipientId, other)));
    const [existing] = await tx
      .select({ id: messageRequests.id })
      .from(messageRequests)
      .where(and(eq(messageRequests.senderId, other), eq(messageRequests.recipientId, userId)));
    if (existing) {
      await tx.update(messageRequests).set({ status: 'ignored', respondedAt: now }).where(eq(messageRequests.id, existing.id));
    } else {
      await tx.insert(messageRequests).values({ senderId: other, recipientId: userId, kind: 'interest', status: 'ignored', createdAt: now, respondedAt: now });
    }
  });
}

export interface ChatListRow {
  conversationId: string;
  person: ChatPersonRow;
  matchedAt: string;
  /** Aún no ha abierto el aviso de match. */
  isNew: boolean;
  lastMessage: { body: string; mine: boolean; createdAt: string } | null;
  unread: number;
}

export interface ChatRequestRow {
  requestId: string;
  kind: 'interest' | 'direct';
  firstMessage: string | null;
  person: ChatPersonRow;
  createdAt: string;
}

export interface ChatInbox {
  /** Matches sin mensajes todavía (fila superior, como «Nuevos matches»). */
  matches: ChatListRow[];
  /** Conversaciones con mensajes, de la más reciente a la más antigua. */
  conversations: ChatListRow[];
  /** Solicitudes recibidas pendientes. */
  requests: ChatRequestRow[];
  /** Para el aviso de la pestaña: conversaciones sin leer + matches nuevos + solicitudes. */
  badge: number;
}

export async function chatInbox(db: Database, userId: string): Promise<ChatInbox> {
  const rows = await db
    .select({ conversation: conversations, member: conversationMembers })
    .from(conversations)
    .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, conversations.id), eq(conversationMembers.userId, userId)))
    .where(eq(conversations.status, 'active'));
  const pending = await db
    .select()
    .from(messageRequests)
    .where(and(eq(messageRequests.recipientId, userId), eq(messageRequests.status, 'pending')))
    .orderBy(desc(messageRequests.createdAt));
  const candidates = [...new Set([...rows.map((r) => otherOf(r.conversation, userId)), ...pending.map((p) => p.senderId)])];
  const visible = new Set<string>();
  for (const id of candidates) if (await canSeePerson(db, userId, id)) visible.add(id);
  const people = await peopleRows(db, userId, [...visible]);

  const active = rows.filter((r) => visible.has(otherOf(r.conversation, userId)));
  const ids = active.map((r) => r.conversation.id);
  const unreadRows = ids.length
    ? await db
        .select({ conversationId: messages.conversationId, n: count() })
        .from(messages)
        .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, userId)))
        .where(
          and(
            inArray(messages.conversationId, ids),
            ne(messages.senderId, userId),
            or(isNull(conversationMembers.lastReadAt), gt(messages.createdAt, conversationMembers.lastReadAt)),
          ),
        )
        .groupBy(messages.conversationId)
    : [];
  const unreadOf = new Map(unreadRows.map((r) => [r.conversationId, r.n]));
  const lastRows = ids.length
    ? await db
        .selectDistinctOn([messages.conversationId])
        .from(messages)
        .where(inArray(messages.conversationId, ids))
        .orderBy(asc(messages.conversationId), desc(messages.createdAt), desc(messages.id))
    : [];
  const lastOf = new Map(lastRows.map((m) => [m.conversationId, m]));

  const list: ChatListRow[] = active.map(({ conversation, member }) => {
    const last = lastOf.get(conversation.id);
    return {
      conversationId: conversation.id,
      person: people.get(otherOf(conversation, userId))!,
      matchedAt: conversation.matchedAt.toISOString(),
      isNew: member.matchSeenAt === null,
      lastMessage: last ? { body: last.body, mine: last.senderId === userId, createdAt: last.createdAt.toISOString() } : null,
      unread: unreadOf.get(conversation.id) ?? 0,
    };
  });
  const matches = list.filter((r) => !r.lastMessage).sort((a, b) => b.matchedAt.localeCompare(a.matchedAt));
  const withMessages = list.filter((r) => r.lastMessage).sort((a, b) => b.lastMessage!.createdAt.localeCompare(a.lastMessage!.createdAt));
  const requests: ChatRequestRow[] = pending
    .filter((p) => visible.has(p.senderId))
    .map((p) => ({ requestId: p.id, kind: p.kind, firstMessage: p.firstMessage, person: people.get(p.senderId)!, createdAt: p.createdAt.toISOString() }));
  const badge = withMessages.filter((r) => r.unread > 0).length + matches.filter((r) => r.isNew).length + requests.length;
  return { matches, conversations: withMessages, requests, badge };
}
