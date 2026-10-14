import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
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
