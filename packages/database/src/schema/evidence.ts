import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogItems } from './catalog.js';
import { userConnections } from './connections.js';
import { users } from './identity.js';

const BASES = `('explicit_rating', 'explicit_like', 'strong_behavior', 'attendance', 'weak_behavior')`;

/** Constraints comunes a observaciones y perfiles: rangos y NULL coherentes. */
function dimensionChecks(table: string) {
  return [
    check(`${table}_known_range`, sql.raw('known_confidence BETWEEN 0 AND 1')),
    check(`${table}_consumed_range`, sql.raw('consumed_confidence BETWEEN 0 AND 1')),
    check(`${table}_consumed_implies_known`, sql.raw('consumed_confidence <= known_confidence')),
    check(`${table}_preference_range`, sql.raw('preference_score IS NULL OR preference_score BETWEEN -1 AND 1')),
    check(
      `${table}_preference_confidence_range`,
      sql.raw('preference_confidence IS NULL OR (preference_confidence > 0 AND preference_confidence <= 1)'),
    ),
    check(
      `${table}_preference_nulls_coherent`,
      sql.raw(
        '(preference_score IS NULL) = (preference_confidence IS NULL) AND (preference_score IS NULL) = (preference_basis IS NULL)',
      ),
    ),
    check(`${table}_preference_basis_valid`, sql.raw(`preference_basis IS NULL OR preference_basis IN ${BASES}`)),
  ];
}

/**
 * Evidencia normalizada (§7, §10). La clave idempotente es (conexión, sourceRecordId, observationKind):
 * repetir un sync actualiza la misma fila. `synced_at` nunca sustituye a `occurred_at`.
 */
export const userItemObservations = pgTable(
  'user_item_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => userConnections.id, { onDelete: 'cascade' }),
    sourceKey: text('source_key').notNull(),
    sourceRecordId: text('source_record_id').notNull(),
    observationKind: text('observation_kind').notNull(),
    mapperVersion: text('mapper_version').notNull(),
    knownConfidence: doublePrecision('known_confidence').notNull(),
    consumedConfidence: doublePrecision('consumed_confidence').notNull(),
    preferenceScore: doublePrecision('preference_score'),
    preferenceConfidence: doublePrecision('preference_confidence'),
    preferenceBasis: text('preference_basis', {
      enum: ['explicit_rating', 'explicit_like', 'strong_behavior', 'attendance', 'weak_behavior'],
    }),
    engagement: jsonb('engagement').$type<{ type: string; value?: number; unit?: string }>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    timestampPrecision: text('timestamp_precision', { enum: ['instant', 'day', 'year'] }),
    /** Huella del contenido evidencial para distinguir "sin cambios" de "actualizado" al repetir un sync. */
    contentHash: text('content_hash').notNull(),
    firstSyncedAt: timestamp('first_synced_at', { withTimezone: true }).notNull().defaultNow(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    uniqueIndex('user_item_observations_idempotency').on(t.connectionId, t.sourceRecordId, t.observationKind),
    index('user_item_observations_user_item_idx').on(t.userId, t.catalogItemId),
    index('user_item_observations_item_idx').on(t.catalogItemId),
    ...dimensionChecks('user_item_observations'),
    check(
      'user_item_observations_time_precision',
      sql`(${t.occurredAt} IS NULL) = (${t.timestampPrecision} IS NULL)`,
    ),
  ],
);

/**
 * Perfil consolidado por usuario y objeto (§10). Se recalcula desde las observaciones; nunca lo modifican
 * acciones dentro de APPINITY (swipes, Keep, Undo, enlaces, amistad, chat).
 */
export const userItemProfiles = pgTable(
  'user_item_profiles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    knownConfidence: doublePrecision('known_confidence').notNull(),
    consumedConfidence: doublePrecision('consumed_confidence').notNull(),
    preferenceScore: doublePrecision('preference_score'),
    preferenceConfidence: doublePrecision('preference_confidence'),
    preferenceBasis: text('preference_basis', {
      enum: ['explicit_rating', 'explicit_like', 'strong_behavior', 'attendance', 'weak_behavior'],
    }),
    evidenceCount: integer('evidence_count').notNull(),
    sourceCount: integer('source_count').notNull(),
    hasConflict: boolean('has_conflict').notNull().default(false),
    notes: jsonb('notes').$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    consolidationVersion: text('consolidation_version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.catalogItemId] }),
    index('user_item_profiles_item_idx').on(t.catalogItemId),
    ...dimensionChecks('user_item_profiles'),
    check('user_item_profiles_counts_positive', sql`${t.evidenceCount} > 0 AND ${t.sourceCount} > 0 AND ${t.sourceCount} <= ${t.evidenceCount}`),
  ],
);
