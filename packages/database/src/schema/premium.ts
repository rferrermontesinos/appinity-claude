import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Premium (§16 y §17, fase 12B). El entitlement solo lo concede el servidor a partir de los webhooks de RevenueCat
 * (nunca la app). Se guarda por entorno: una compra de sandbox no da Premium en producción ni al revés.
 */
export const entitlements = pgTable(
  'entitlements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Identificador del entitlement en RevenueCat (p. ej., «premium»). */
    entitlementId: text('entitlement_id').notNull(),
    environment: text('environment', { enum: ['sandbox', 'production'] }).notNull(),
    active: boolean('active').notNull(),
    productId: text('product_id'),
    /** NULL: sin caducidad (compra vitalicia). */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Momento del último evento aplicado: los eventos más antiguos que lleguen tarde se ignoran. */
    lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.entitlementId, t.environment] }),
    check('entitlements_environment_valid', sql`${t.environment} IN ('sandbox', 'production')`),
  ],
);

/**
 * Eventos de RevenueCat recibidos (idempotencia: RevenueCat entrega «al menos una vez» y reintenta con el mismo id).
 * Minimización: sin el payload completo, solo lo necesario para auditar.
 */
export const revenuecatEvents = pgTable(
  'revenuecat_events',
  {
    eventId: text('event_id').primaryKey(),
    type: text('type').notNull(),
    environment: text('environment'),
    /** Usuario de APPINITY afectado, si se resolvió. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    productId: text('product_id'),
    eventAt: timestamp('event_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    /** applied, ignored_stale, ignored_entitlement, ignored_environment, unknown_user, test. */
    outcome: text('outcome').notNull(),
  },
  (t) => [index('revenuecat_events_user_idx').on(t.userId)],
);
