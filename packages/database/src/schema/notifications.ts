import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Notificaciones push (fase 12C). Tokens de Expo por dispositivo y registro de envíos (deduplicación por fecha local:
 * como mucho un resumen al día por persona).
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Token de Expo («ExponentPushToken[…]»). Un mismo dispositivo que cambia de cuenta pasa a la nueva. */
    token: text('token').notNull(),
    platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Expo respondió DeviceNotRegistered: no se envía más hasta que el dispositivo lo vuelva a registrar. */
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('push_tokens_token_unique').on(t.token),
    index('push_tokens_user_idx').on(t.userId),
    check('push_tokens_platform_valid', sql`${t.platform} IN ('ios', 'android')`),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['digest'] }).notNull(),
    /** Fecha en la zona horaria de la persona: clave de deduplicación. */
    localDate: date('local_date').notNull(),
    /** sent: aceptado por Expo; empty: nada nuevo que contar; no_tokens; failed. */
    status: text('status', { enum: ['sent', 'empty', 'no_tokens', 'failed'] }).notNull(),
    recommendations: integer('recommendations').notNull().default(0),
    unreadChats: integer('unread_chats').notNull().default(0),
    /** Ids de ticket de Expo (para consultar los recibos). */
    tickets: text('tickets').array().notNull().default(sql`'{}'::text[]`),
    error: text('error'),
    /** Recibos de Expo consultados (~15 min después): ok, o el error de FCM/APNs. */
    receiptsCheckedAt: timestamp('receipts_checked_at', { withTimezone: true }),
    receiptErrors: integer('receipt_errors'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_deliveries_user_day_unique').on(t.userId, t.kind, t.localDate),
    check('notification_deliveries_status_valid', sql`${t.status} IN ('sent', 'empty', 'no_tokens', 'failed')`),
  ],
);
