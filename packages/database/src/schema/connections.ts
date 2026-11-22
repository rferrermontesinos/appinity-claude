import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/** Consentimiento separado por proveedor, con los scopes concedidos y su revocación. */
export const providerConsents = pgTable(
  'provider_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceKey: text('source_key').notNull(),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    consentVersion: text('consent_version').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('provider_consents_user_idx').on(t.userId, t.sourceKey)],
);

/**
 * Conexión de un usuario con una fuente de perfil. Una sola conexión no revocada por fuente y usuario.
 * El cursor solo avanza tras un sync correcto.
 */
export const userConnections = pgTable(
  'user_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceKey: text('source_key').notNull(),
    status: text('status', { enum: ['active', 'error', 'revoked'] }).notNull().default('active'),
    externalAccountRef: text('external_account_ref'),
    consentId: uuid('consent_id').references(() => providerConsents.id, { onDelete: 'set null' }),
    syncCursor: jsonb('sync_cursor').$type<Record<string, string | number | boolean | null>>(),
    watermarkAt: timestamp('watermark_at', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSyncStatus: text('last_sync_status'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('user_connections_one_open_per_source')
      .on(t.userId, t.sourceKey)
      .where(sql`${t.status} <> 'revoked'`),
    index('user_connections_user_idx').on(t.userId),
    check('user_connections_status_valid', sql`${t.status} IN ('active', 'error', 'revoked')`),
    check('user_connections_revoked_at', sql`(${t.status} = 'revoked') = (${t.revokedAt} IS NOT NULL)`),
  ],
);

/**
 * Credenciales de proveedor cifradas (AES-256-GCM). Nunca salen del backend ni se registran en logs.
 */
export const sourceCredentials = pgTable('source_credentials', {
  connectionId: uuid('connection_id')
    .primaryKey()
    .references(() => userConnections.id, { onDelete: 'cascade' }),
  ciphertext: text('ciphertext').notNull(),
  keyVersion: smallint('key_version').notNull().default(1),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Ejecuciones de sync con contadores, errores parciales y cursores antes/después. */
export const sourceSyncRuns = pgTable(
  'source_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => userConnections.id, { onDelete: 'cascade' }),
    trigger: text('trigger', { enum: ['user', 'seed', 'schedule', 'connect'] }).notNull(),
    mode: text('mode', { enum: ['incremental', 'full'] }).notNull().default('incremental'),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'] })
      .notNull()
      .default('queued'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    recordsReceived: integer('records_received').notNull().default(0),
    observationsInserted: integer('observations_inserted').notNull().default(0),
    observationsUpdated: integer('observations_updated').notNull().default(0),
    observationsUnchanged: integer('observations_unchanged').notNull().default(0),
    observationsDeleted: integer('observations_deleted').notNull().default(0),
    itemsCreated: integer('items_created').notNull().default(0),
    partialErrors: jsonb('partial_errors')
      .$type<Array<{ sourceRecordId?: string; code: string; message: string }>>()
      .notNull()
      .default([]),
    errorMessage: text('error_message'),
    cursorBefore: jsonb('cursor_before'),
    cursorAfter: jsonb('cursor_after'),
  },
  (t) => [
    index('source_sync_runs_connection_idx').on(t.connectionId, t.queuedAt),
    check(
      'source_sync_runs_status_valid',
      sql`${t.status} IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')`,
    ),
    check(
      'source_sync_runs_counts_non_negative',
      sql`${t.recordsReceived} >= 0 AND ${t.observationsInserted} >= 0 AND ${t.observationsUpdated} >= 0 AND ${t.observationsUnchanged} >= 0 AND ${t.observationsDeleted} >= 0 AND ${t.itemsCreated} >= 0`,
    ),
  ],
);
