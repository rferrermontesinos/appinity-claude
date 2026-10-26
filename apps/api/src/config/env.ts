import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

/** Booleano con valor por defecto explícito (para flags que nacen activados). */
const flag = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DEMO_MODE: bool,
    DEV_AUTH_ENABLED: bool,
    DEV_AUTH_SECRET: z.string().optional(),
    CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
    /**
     * Proxies de confianza (valor de `trust proxy` de Express) para leer la IP real de X-Forwarded-For. Sin él, detrás
     * de un proxy todas las peticiones comparten su IP y el límite de peticiones se aplica a todos a la vez. Vacío =
     * no se confía en ninguno. Solo rangos con nombre o subredes (p. ej. «loopback, uniquelocal»), nunca «true».
     */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : undefined))
      .refine(
        (v) =>
          v === undefined ||
          v.split(',').every((part) => /^(loopback|linklocal|uniquelocal|[0-9a-f]*[.:][0-9a-f.:]*(\/\d{1,3})?)$/i.test(part.trim())),
        'TRUST_PROXY: rangos con nombre (loopback, linklocal, uniquelocal) o subredes, separados por comas',
      ),
    PUBLIC_API_URL: z.union([z.literal(''), z.url()]).optional(),
    STORAGE_DIR: z.string().default('.data/media'),
    QUEUE_PREFIX: z.string().regex(/^[a-z0-9-]+$/).default('appinity-claude'),
    STEAM_WEB_API_KEY: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : undefined))
      .refine((v) => v === undefined || /^[0-9A-F]{32}$/i.test(v), 'STEAM_WEB_API_KEY debe tener 32 caracteres hexadecimales'),
    SYNC_INTERVAL_HOURS: z.coerce.number().min(1).max(168).default(24),
    /** Cliente OAuth de Google (tipo «Aplicación web») para Data Portability. Solo servidor. */
    GOOGLE_OAUTH_CLIENT_ID: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : undefined))
      .refine((v) => v === undefined || /^[\w-]+\.apps\.googleusercontent\.com$/.test(v), 'GOOGLE_OAUTH_CLIENT_ID debe terminar en .apps.googleusercontent.com'),
    GOOGLE_OAUTH_CLIENT_SECRET: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : undefined)),
    /** Debe coincidir EXACTAMENTE con la URI autorizada del cliente. Google solo admite http con localhost. */
    /** RevenueCat (fase 12B): valor exacto de la cabecera Authorization configurada en su panel para el webhook. */
    REVENUECAT_WEBHOOK_AUTH: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : undefined))
      .refine((v) => v === undefined || v.length >= 24, 'REVENUECAT_WEBHOOK_AUTH debe tener al menos 24 caracteres'),
    REVENUECAT_ENTITLEMENT_ID: z.string().min(1).default('premium'),
    /** Entorno cuyas compras cuentan aquí. Por defecto, sandbox salvo con NODE_ENV=production. */
    PREMIUM_ENVIRONMENT: z
      .union([z.literal(''), z.enum(['sandbox', 'production'])])
      .optional()
      .transform((v) => v || undefined),
    /** Flags de mensajería (§16). EARLY_ACCESS: chat gratuito con solicitud y aceptación (activado por defecto). */
    CHAT_EARLY_ACCESS: flag(true),
    /** PREMIUM_DIRECT_MESSAGE: Premium escribe sin match. Sin RevenueCat nadie es Premium, así que no tiene efecto. */
    CHAT_PREMIUM_DIRECT_MESSAGE: flag(false),
    /** Regla de producto «más adelante»: hablar con almas gemelas (no amigas) exige Premium. Desactivado por defecto. */
    CHAT_SOULMATES_PREMIUM: flag(false),
    /** Firma de las sesiones de producción (fase 13). Obligatorio con NODE_ENV=production. */
    AUTH_SECRET: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : undefined))
      .refine((v) => v === undefined || v.length >= 32, 'AUTH_SECRET debe tener al menos 32 caracteres'),
    /** Vuelta de «Continuar con Google». Debe estar autorizada en el cliente OAuth (en desarrollo, localhost). */
    GOOGLE_SIGNIN_REDIRECT_URI: z.url().default('http://localhost:3100/v1/auth/google/callback'),
    /** Vuelta de la conexión de Google Books (cuentas ya creadas). Debe estar autorizada en el cliente OAuth. */
    GOOGLE_BOOKS_REDIRECT_URI: z.url().default('http://localhost:3100/v1/connect/google_books/callback'),
    /** Scopes restringidos de Data Portability (YouTube y destacados de Maps): exigen CASA de pago en producción. */
    /** Origen de la vista web (enlaces de invitación). En desarrollo, http://localhost:8092. */
    APP_WEB_ORIGIN: z.url().optional(),
    GOOGLE_RESTRICTED_SCOPES: z.enum(['true', 'false']).optional(),
    /** Trakt (fase 11): client_id de la app creada en Trakt; el secreto es opcional (PKCE). */
    TRAKT_CLIENT_ID: z.string().optional().transform((v) => (v ? v.trim() : undefined)),
    TRAKT_CLIENT_SECRET: z.string().optional().transform((v) => (v ? v.trim() : undefined)),
    TRAKT_REDIRECT_URI: z.url().default('http://localhost:3100/v1/connect/trakt/callback'),
    ANILIST_CLIENT_ID: z.string().optional().transform((v) => (v ? v.trim() : undefined)),
    ANILIST_CLIENT_SECRET: z.string().optional().transform((v) => (v ? v.trim() : undefined)),
    ANILIST_REDIRECT_URI: z.url().default('http://localhost:3100/v1/connect/anilist/callback'),
    GOOGLE_OAUTH_REDIRECT_URI: z.url().default('http://localhost:3100/v1/connect/google_portability/callback'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && (env.DEMO_MODE || env.DEV_AUTH_ENABLED)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEMO_MODE'],
        message: 'DEMO_MODE y DEV_AUTH_ENABLED están prohibidos con NODE_ENV=production',
      });
    }
    if (env.NODE_ENV === 'production' && !env.AUTH_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET'], message: 'AUTH_SECRET es obligatorio con NODE_ENV=production' });
    }
    if (env.DEV_AUTH_ENABLED && !env.DEMO_MODE) {
      ctx.addIssue({ code: 'custom', path: ['DEV_AUTH_ENABLED'], message: 'La identidad de desarrollo requiere DEMO_MODE=true' });
    }
    if (env.DEV_AUTH_ENABLED && (env.DEV_AUTH_SECRET?.length ?? 0) < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_AUTH_SECRET'],
        message: 'DEV_AUTH_SECRET debe tener al menos 32 caracteres (ejecuta pnpm setup)',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Configuración no válida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const APP_ENV = Symbol('APP_ENV');
