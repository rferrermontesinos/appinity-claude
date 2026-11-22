import { z } from 'zod';

/**
 * Error de JavaScript de la app que la API reenvía a los avisos de errores (fase B4). Solo lo técnico: tipo, mensaje,
 * pila, si cerró la app, la pantalla como patrón de expo-router («person/[id]», nunca con identificadores), la plataforma
 * y la versión. Nunca la persona, su sesión ni lo que estaba viendo.
 */
export const appErrorReportSchema = z.strictObject({
  name: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(1_000),
  stack: z.string().max(8_000).optional(),
  fatal: z.boolean(),
  screen: z
    .string()
    .regex(/^[\w\-/[\]().]{1,120}$/)
    .optional(),
  platform: z.enum(['android', 'ios', 'web']),
  appVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,4}$/),
});

export type AppErrorReportDto = z.infer<typeof appErrorReportSchema>;

/** Avisos que la app envía como mucho en una sesión (un mismo error, una sola vez). */
export const APP_ERROR_REPORTS_PER_SESSION = 10;
