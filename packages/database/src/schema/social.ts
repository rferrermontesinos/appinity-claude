import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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

/**
 * Invitaciones (crecimiento por grupos de amigos, 2026-10-22): un enlace con código. Compartirlo es el consentimiento de
 * quien invita; aceptarlo, el de quien recibe. Aceptar crea la amistad y abre el chat, como una solicitud aceptada.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    maxUses: integer('max_uses').notNull().default(20),
    uses: integer('uses').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('invitations_code_unique').on(t.code),
    index('invitations_inviter_idx').on(t.inviterId),
    check('invitations_uses_range', sql`${t.uses} >= 0 AND ${t.uses} <= ${t.maxUses}`),
  ],
);

/**
 * Personas que sigues (decisiones 2026-10-26): creadores con perfil público y amigos. Seguir nunca cambia gustos ni
 * afinidades; solo añade el bloque «seguidos» de Inicio y el motivo combinado. Un bloqueo elimina el seguimiento en
 * ambos sentidos. Si deja de ser creador o amigo, el seguimiento se ignora al leer (no se borra).
 */
export const follows = pgTable(
  'follows',
  {
    followerUserId: uuid('follower_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followedUserId: uuid('followed_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerUserId, t.followedUserId] }),
    index('follows_followed_idx').on(t.followedUserId),
    check('follows_not_self', sql`${t.followerUserId} <> ${t.followedUserId}`),
  ],
);
