import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Autenticación de producción (fase 13). Identidad externa verificada (OpenID Connect) y sesiones propias.
 * - `auth_identities`: una por proveedor y sujeto (`sub` del ID token). El email solo se guarda si el proveedor lo da
 *   verificado; servirá para recuperar la cuenta y, con permiso, para el matching de contactos.
 * - `auth_sessions`: refresh token opaco guardado solo como hash (SHA-256); rotación en cada uso y revocación.
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['google', 'apple'] }).notNull(),
    subject: text('subject').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_identities_provider_subject_unique').on(t.provider, t.subject),
    index('auth_identities_user_idx').on(t.userId),
    check('auth_identities_provider_valid', sql`${t.provider} IN ('google', 'apple')`),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    /** Hash del refresh token anterior: si alguien lo vuelve a presentar, el token se ha filtrado y se revoca la sesión. */
    previousRefreshTokenHash: text('previous_refresh_token_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('auth_sessions_refresh_unique').on(t.refreshTokenHash),
    index('auth_sessions_previous_refresh_idx').on(t.previousRefreshTokenHash),
    index('auth_sessions_user_idx').on(t.userId),
  ],
);
