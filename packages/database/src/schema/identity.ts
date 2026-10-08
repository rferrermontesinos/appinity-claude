import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { geographyPoint, pointFrom } from './types.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Cuentas. `dataset` separa los usuarios simulados de la demo ('demo') de los reales ('live'):
 * la identidad de desarrollo solo puede abrir sesión con usuarios 'demo'.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handle: text('handle').notNull().unique(),
    dataset: text('dataset', { enum: ['demo', 'live'] }).notNull().default('live'),
    status: text('status', { enum: ['active', 'suspended', 'deleted'] }).notNull().default('active'),
    adultConfirmedAt: timestamp('adult_confirmed_at', { withTimezone: true }),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    /** Descripción de la persona simulada (solo dataset demo). */
    demoNote: text('demo_note'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('users_handle_format', sql`${t.handle} ~ '^[a-z0-9_]{3,32}$'`),
    check('users_dataset_valid', sql`${t.dataset} IN ('demo', 'live')`),
    check('users_status_valid', sql`${t.status} IN ('active', 'suspended', 'deleted')`),
    check('users_demo_note_only_demo', sql`${t.demoNote} IS NULL OR ${t.dataset} = 'demo'`),
  ],
);

/** Perfil público mínimo: nombre, país y foto. Nunca historiales importados. */
export const userProfiles = pgTable(
  'user_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    countryCode: text('country_code'),
    avatarUrl: text('avatar_url'),
    ...timestamps,
  },
  (t) => [
    check('user_profiles_display_name_length', sql`char_length(${t.displayName}) BETWEEN 1 AND 64`),
    check('user_profiles_country_code_format', sql`${t.countryCode} IS NULL OR ${t.countryCode} ~ '^[A-Z]{2}$'`),
  ],
);

/**
 * Ajustes. La ubicación es una zona aproximada (coordenadas redondeadas) con su origen;
 * no se guarda historial GPS.
 */
export const userSettings = pgTable(
  'user_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: ['es', 'en'] }).notNull().default('es'),
    timeZone: text('time_zone').notNull().default('Europe/Madrid'),
    radiusKm: smallint('radius_km').notNull().default(10),
    locationLabel: text('location_label'),
    locationLatitude: doublePrecision('location_latitude'),
    locationLongitude: doublePrecision('location_longitude'),
    locationSource: text('location_source', { enum: ['manual', 'device'] }),
    location: geographyPoint('location').generatedAlwaysAs(pointFrom('location_longitude', 'location_latitude')),
    locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }),
    discoverableByContacts: boolean('discoverable_by_contacts').notNull().default(true),
    notificationFrequency: text('notification_frequency', {
      enum: ['daily', 'three_per_week', 'weekly', 'off'],
    })
      .notNull()
      .default('three_per_week'),
    ...timestamps,
  },
  (t) => [
    check('user_settings_radius_range', sql`${t.radiusKm} BETWEEN 1 AND 50`),
    check('user_settings_locale_valid', sql`${t.locale} IN ('es', 'en')`),
    check(
      'user_settings_location_complete',
      sql`(${t.locationLatitude} IS NULL) = (${t.locationLongitude} IS NULL) AND (${t.locationLatitude} IS NULL) = (${t.locationSource} IS NULL)`,
    ),
    check(
      'user_settings_location_range',
      sql`${t.locationLatitude} IS NULL OR (${t.locationLatitude} BETWEEN -90 AND 90 AND ${t.locationLongitude} BETWEEN -180 AND 180)`,
    ),
    check(
      'user_settings_notification_frequency_valid',
      sql`${t.notificationFrequency} IN ('daily', 'three_per_week', 'weekly', 'off')`,
    ),
    index('user_settings_location_gist').using('gist', t.location),
  ],
);
