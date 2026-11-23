import { z } from 'zod';

/** Longitud máxima de un comentario de la beta. */
export const FEEDBACK_MAX_LENGTH = 2_000;
/** Comentarios que una persona puede enviar en 24 horas. */
export const FEEDBACK_PER_DAY = 10;

/**
 * Comentario enviado desde Perfil → «Enviar comentario» (fase B5). Lo escribe la persona; la app añade solo la versión y
 * la plataforma, para saber a qué build se refiere.
 */
export const feedbackSchema = z.strictObject({
  message: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
  appVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,4}$/),
  platform: z.enum(['android', 'ios', 'web']),
});

export type FeedbackDto = z.infer<typeof feedbackSchema>;
