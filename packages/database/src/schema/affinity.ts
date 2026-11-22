import { sql } from 'drizzle-orm';
import { check, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

const CATEGORY_CHECK = sql`('food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts')`;

/**
 * Afinidad direccional por categoría (§11): una fila por pareja ordenada y categoría CON resultado. La ausencia de fila
 * significa NULL (sin evidencia comparable suficiente), nunca 0. Solo cifras agregadas: nunca qué objetos coinciden.
 */
export const categoryAffinities = pgTable(
  'category_affinities',
  {
    sourceUserId: uuid('source_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category', { enum: ['food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts'] }).notNull(),
    score: doublePrecision('score').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    commonItems: integer('common_items').notNull(),
    effectiveEvidence: doublePrecision('effective_evidence').notNull(),
    agreement: doublePrecision('agreement').notNull(),
    coverage: doublePrecision('coverage').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceUserId, t.targetUserId, t.category] }),
    index('category_affinities_target_idx').on(t.targetUserId),
    check('category_affinities_not_self', sql`${t.sourceUserId} <> ${t.targetUserId}`),
    check('category_affinities_category_valid', sql`${t.category} IN ${CATEGORY_CHECK}`),
    check('category_affinities_score_range', sql`${t.score} BETWEEN 0 AND 100`),
    check('category_affinities_confidence_range', sql`${t.confidence} BETWEEN 0 AND 1`),
    check('category_affinities_agreement_range', sql`${t.agreement} BETWEEN 0 AND 1`),
    check('category_affinities_coverage_range', sql`${t.coverage} BETWEEN 0 AND 1`),
    check('category_affinities_counts', sql`${t.commonItems} > 0 AND ${t.effectiveEvidence} > 0`),
  ],
);

/** Afinidad global direccional: una fila por pareja ordenada con al menos una categoría comparable. */
export const userAffinities = pgTable(
  'user_affinities',
  {
    sourceUserId: uuid('source_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    categoriesCompared: integer('categories_compared').notNull(),
    commonItems: integer('common_items').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceUserId, t.targetUserId] }),
    // Ranking de almas gemelas: por origen, de mayor a menor afinidad.
    index('user_affinities_ranking_idx').on(t.sourceUserId, t.score.desc(), t.confidence.desc()),
    index('user_affinities_target_idx').on(t.targetUserId),
    check('user_affinities_not_self', sql`${t.sourceUserId} <> ${t.targetUserId}`),
    check('user_affinities_score_range', sql`${t.score} BETWEEN 0 AND 100`),
    check('user_affinities_confidence_range', sql`${t.confidence} BETWEEN 0 AND 1`),
    check('user_affinities_counts', sql`${t.categoriesCompared} BETWEEN 1 AND 8 AND ${t.commonItems} > 0`),
  ],
);
