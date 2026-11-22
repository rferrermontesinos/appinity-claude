import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalog.js';
import { users } from './identity.js';

/**
 * Descartes de Home (§2): por usuario y objeto canónico, no por sesión. Un objeto descartado no reaparece en Home
 * mientras se conserve el descarte; Categories no lo aplica. Nunca modifica los gustos (user_item_profiles).
 */
export const homeDismissals = pgTable(
  'home_dismissals',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.catalogItemId] }), index('home_dismissals_item_idx').on(t.catalogItemId)],
);

/**
 * Impresiones (§2): se registra cuando la tarjeta se muestra de verdad, no al precargarla. NEW = el objeto nunca se había
 * mostrado a esa persona (no significa estreno). Deshacer no borra impresiones.
 */
export const recommendationImpressions = pgTable(
  'recommendation_impressions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    firstShownAt: timestamp('first_shown_at', { withTimezone: true }).notNull().defaultNow(),
    lastShownAt: timestamp('last_shown_at', { withTimezone: true }).notNull().defaultNow(),
    timesShown: integer('times_shown').notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.catalogItemId] }),
    check('recommendation_impressions_times_positive', sql`${t.timesShown} > 0`),
  ],
);

/**
 * Acciones de Home: descartar o conservar. Conservar no crea ninguna lista (fuera del MVP): el objeto puede volver en
 * otra sesión. Deshacer marca la acción (undone_at) y revierte su estado. Ninguna acción cambia gustos ni afinidades.
 */
export const recommendationActions = pgTable(
  'recommendation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    action: text('action', { enum: ['dismiss', 'keep'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (t) => [
    index('recommendation_actions_user_idx').on(t.userId, t.createdAt),
    check('recommendation_actions_action_valid', sql`${t.action} IN ('dismiss', 'keep')`),
  ],
);
