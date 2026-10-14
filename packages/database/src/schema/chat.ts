import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Chat (§16, fase 12A). Modelo «match», como en Tinder: nadie recibe mensajes de quien no ha aceptado.
 *
 * - `message_requests`: interés de una persona por hablar con otra.
 *   - `interest` (EARLY_ACCESS): sin texto; la otra persona acepta o ignora.
 *   - `direct` (PREMIUM_DIRECT_MESSAGE): lleva el primer mensaje; responder equivale a aceptar.
 *   Ignorar no se revela a quien la envió (la sigue viendo «enviada») y no genera ninguna señal.
 * - `conversations`: una por pareja (ordenada) tras el match (aceptación, interés mutuo o amistad aceptada).
 * - `messages`: solo dentro de una conversación activa.
 *
 * Nada de esto lee ni escribe gustos, preferencias ni afinidades.
 */
export const messageRequests = pgTable(
  'message_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['interest', 'direct'] }).notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'ignored'] }).notNull().default('pending'),
    /** Solo en `direct`: el primer mensaje (Premium). */
    firstMessage: text('first_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('message_requests_pair_unique').on(t.senderId, t.recipientId),
    index('message_requests_recipient_idx').on(t.recipientId, t.status),
    index('message_requests_sender_created_idx').on(t.senderId, t.createdAt),
    check('message_requests_not_self', sql`${t.senderId} <> ${t.recipientId}`),
    check('message_requests_kind_valid', sql`${t.kind} IN ('interest', 'direct')`),
    check('message_requests_status_valid', sql`${t.status} IN ('pending', 'accepted', 'ignored')`),
    check(
      'message_requests_first_message',
      sql`(${t.kind} = 'direct') = (${t.firstMessage} IS NOT NULL) AND (${t.firstMessage} IS NULL OR char_length(${t.firstMessage}) BETWEEN 1 AND 1000)`,
    ),
    check('message_requests_responded', sql`(${t.status} = 'pending') = (${t.respondedAt} IS NULL)`),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Pareja ordenada (user_low < user_high): una conversación por pareja. */
    userLow: uuid('user_low')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userHigh: uuid('user_high')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    origin: text('origin', { enum: ['request', 'mutual', 'friendship', 'direct'] }).notNull(),
    /** `closed`: deshecho el match o bloqueo. Invisible para ambas personas; un nuevo match la reabre vacía. */
    status: text('status', { enum: ['active', 'closed'] }).notNull().default('active'),
    matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('conversations_pair_unique').on(t.userLow, t.userHigh),
    index('conversations_high_idx').on(t.userHigh),
    check('conversations_ordered', sql`${t.userLow} < ${t.userHigh}`),
    check('conversations_origin_valid', sql`${t.origin} IN ('request', 'mutual', 'friendship', 'direct')`),
    check('conversations_status_valid', sql`${t.status} IN ('active', 'closed')`),
    check('conversations_closed', sql`(${t.status} = 'closed') = (${t.closedAt} IS NOT NULL)`),
  ],
);

/** Estado de lectura por persona: último mensaje leído y si ya vio el aviso de match. */
export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    matchSeenAt: timestamp('match_seen_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conversation_members_user_idx').on(t.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** Identificador del cliente para reintentos idempotentes (opcional). */
    clientId: text('client_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt),
    index('messages_sender_created_idx').on(t.senderId, t.createdAt),
    uniqueIndex('messages_client_unique').on(t.senderId, t.clientId),
    check('messages_body_length', sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
    check('messages_client_id_length', sql`${t.clientId} IS NULL OR char_length(${t.clientId}) <= 64`),
  ],
);
