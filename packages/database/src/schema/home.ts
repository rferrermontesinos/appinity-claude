import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalog.js';
import { users } from './identity.js';

/**
 * Descartes de Home (§2): por usuario y objeto canónico, no por sesión. Un objeto descartado no reaparece en Home
 * mientras se conserve el descarte; Categories no lo aplica. Nunca modifica los gustos (user_item_profiles).
 * Las acciones (descartar, conservar, deshacer) llegan con la fase 8.
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
