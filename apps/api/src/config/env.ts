import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

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
