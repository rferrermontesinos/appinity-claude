import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Bloqueos entre personas (§4 y §17). Un bloqueo en cualquier dirección excluye a ambas del ranking de almas gemelas,
 * del perfil y de las recomendaciones atribuidas. La gestión desde la app llega con la fase 10 (People y Friends).
 */
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerUserId: uuid('blocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedUserId: uuid('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerUserId, t.blockedUserId] }),
    index('user_blocks_blocked_idx').on(t.blockedUserId),
    check('user_blocks_not_self', sql`${t.blockerUserId} <> ${t.blockedUserId}`),
  ],
);

/**
 * Amistad (§4): solicitud y respuesta. Una sola fila por pareja, sea cual sea el sentido (índice único sobre la pareja
 * ordenada). Un rechazo no se comunica a quien envió la solicitud: para esa persona sigue «pendiente».
 * Los amigos no tienen por qué ser almas gemelas.
 */
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('friendships_pair_unique').using(
      'btree',
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
    index('friendships_addressee_idx').on(t.addresseeId, t.status),
    check('friendships_not_self', sql`${t.requesterId} <> ${t.addresseeId}`),
    check('friendships_status_valid', sql`${t.status} IN ('pending', 'accepted', 'rejected')`),
    check('friendships_responded', sql`(${t.status} = 'pending') = (${t.respondedAt} IS NULL)`),
  ],
);

/** Reportes (§16 y §17): quedan para revisión; no se muestran a la persona reportada. */
export const userReports = pgTable(
  'user_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reportedId: uuid('reported_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason', { enum: ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'] }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_reports_reported_idx').on(t.reportedId),
    check('user_reports_not_self', sql`${t.reporterId} <> ${t.reportedId}`),
    check('user_reports_reason_valid', sql`${t.reason} IN ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')`),
    check('user_reports_note_length', sql`${t.note} IS NULL OR char_length(${t.note}) <= 500`),
  ],
);
