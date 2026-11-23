import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Comentarios de la beta (fase B5): lo que una persona escribe en Perfil → «Enviar comentario», con la versión y la
 * plataforma de la app. Se borran con la cuenta y entran en la copia de sus datos. El titular los lee con
 * `pnpm feedback:list`.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    appVersion: text('app_version').notNull(),
    platform: text('platform', { enum: ['android', 'ios', 'web'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Cuándo lo marcó como leído el titular (`pnpm feedback:list --mark-read`). */
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    index('feedback_user_created_idx').on(t.userId, t.createdAt),
    index('feedback_created_idx').on(t.createdAt),
    check('feedback_platform_valid', sql`${t.platform} IN ('android', 'ios', 'web')`),
    check('feedback_message_length', sql`char_length(${t.message}) BETWEEN 1 AND 2000`),
  ],
);
