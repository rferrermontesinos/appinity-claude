import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { geographyPoint, pointFrom } from './types.js';

const CATEGORY_CHECK = `('food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts')`;

/**
 * Objeto canónico del catálogo. `dataset` aísla el catálogo de la demo del catálogo real: una importación
 * real nunca se resuelve contra un objeto de la demo aunque comparta IDs externos.
 */
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dataset: text('dataset', { enum: ['demo', 'live'] }).notNull(),
    category: text('category', {
      enum: ['food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts'],
    }).notNull(),
    itemType: text('item_type').notNull(),
    title: text('title').notNull(),
    /** Título normalizado (minúsculas, sin acentos ni puntuación) para la resolución por atributos. */
    normalizedTitle: text('normalized_title').notNull(),
    description: text('description'),
    releaseDate: date('release_date', { mode: 'string' }),
    releaseDatePrecision: text('release_date_precision', { enum: ['day', 'month', 'year'] }),
    /** Con precisión de día se guarda la medianoche UTC del día y la precisión aparte. */
    eventStartsAt: timestamp('event_starts_at', { withTimezone: true }),
    eventEndsAt: timestamp('event_ends_at', { withTimezone: true }),
    eventDatePrecision: text('event_date_precision', { enum: ['day', 'instant'] }),
    parentItemId: uuid('parent_item_id').references((): AnyPgColumn => catalogItems.id, { onDelete: 'set null' }),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    location: geographyPoint('location').generatedAlwaysAs(pointFrom('longitude', 'latitude')),
    locality: text('locality'),
    countryCode: text('country_code'),
    externalLinks: jsonb('external_links').$type<Array<{ provider: string; url: string }>>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    /** Cómo se creó: proveedor de catálogo o candidato de una fuente de perfil. */
    createdVia: text('created_via').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('catalog_items_dataset_valid', sql`${t.dataset} IN ('demo', 'live')`),
    check('catalog_items_category_valid', sql.raw(`category IN ${CATEGORY_CHECK}`)),
    check('catalog_items_item_type_format', sql`${t.itemType} ~ '^[a-z][a-z0-9_]*$'`),
    check('catalog_items_title_not_blank', sql`char_length(btrim(${t.title})) > 0`),
    check(
      'catalog_items_release_precision',
      sql`(${t.releaseDate} IS NULL) = (${t.releaseDatePrecision} IS NULL)`,
    ),
    check(
      'catalog_items_event_precision',
      sql`(${t.eventStartsAt} IS NULL AND ${t.eventEndsAt} IS NULL) OR ${t.eventDatePrecision} IS NOT NULL`,
    ),
    check('catalog_items_event_order', sql`${t.eventEndsAt} IS NULL OR ${t.eventStartsAt} IS NULL OR ${t.eventEndsAt} >= ${t.eventStartsAt}`),
    check('catalog_items_location_complete', sql`(${t.latitude} IS NULL) = (${t.longitude} IS NULL)`),
    check('catalog_items_no_self_parent', sql`${t.parentItemId} IS NULL OR ${t.parentItemId} <> ${t.id}`),
    index('catalog_items_dataset_category_idx').on(t.dataset, t.category),
    index('catalog_items_normalized_title_idx').on(t.dataset, t.category, t.normalizedTitle),
    index('catalog_items_parent_idx').on(t.parentItemId),
    index('catalog_items_location_gist').using('gist', t.location),
  ],
);

/**
 * IDs externos con espacio de nombres (proveedor + tipo). La unicidad por dataset impide que dos objetos
 * canónicos compartan un mismo ID de proveedor (tmdb:movie:289 ≠ tmdb:tv:289).
 */
export const catalogExternalIds = pgTable(
  'catalog_external_ids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    dataset: text('dataset', { enum: ['demo', 'live'] }).notNull(),
    provider: text('provider').notNull(),
    idType: text('id_type').notNull(),
    externalId: text('external_id').notNull(),
    /** Fuente o proveedor que aportó el ID (trazabilidad de la resolución). */
    contributedBy: text('contributed_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('catalog_external_ids_unique').on(t.dataset, t.provider, t.idType, t.externalId),
    index('catalog_external_ids_item_idx').on(t.catalogItemId),
    check('catalog_external_ids_provider_format', sql`${t.provider} ~ '^[a-z][a-z0-9_]*$'`),
    check('catalog_external_ids_type_format', sql`${t.idType} ~ '^[a-z][a-z0-9_]*$'`),
    check('catalog_external_ids_value_not_blank', sql`char_length(btrim(${t.externalId})) > 0`),
  ],
);

/**
 * Imagen principal persistente (referencia + archivo cacheado cuando la licencia lo permite). El fallback
 * de categoría no se guarda: se calcula al construir el DTO.
 */
export const catalogImages = pgTable(
  'catalog_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogItemId: uuid('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['primary'] }).notNull().default('primary'),
    source: text('source').notNull(),
    sourceImageId: text('source_image_id'),
    url: text('url').notNull(),
    originalUrl: text('original_url'),
    storageKey: text('storage_key'),
    mime: text('mime'),
    width: integer('width'),
    height: integer('height'),
    alt: text('alt').notNull(),
    author: text('author'),
    license: text('license'),
    licenseUrl: text('license_url'),
    attributionRequired: boolean('attribution_required').notNull().default(false),
    descriptionUrl: text('description_url'),
    restrictions: text('restrictions'),
    cacheStatus: text('cache_status', { enum: ['reference', 'cached', 'failed'] }).notNull().default('reference'),
    cacheError: text('cache_error'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('catalog_images_item_role_unique').on(t.catalogItemId, t.role),
    check('catalog_images_url_scheme', sql`${t.url} ~ '^https://'`),
    check('catalog_images_cached_has_key', sql`${t.cacheStatus} <> 'cached' OR ${t.storageKey} IS NOT NULL`),
    check('catalog_images_size_positive', sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`),
  ],
);
