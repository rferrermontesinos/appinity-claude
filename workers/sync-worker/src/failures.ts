import type { ErrorContext } from '@appinity/observability';
import { isSourceError } from '@appinity/shared';

/** Versión del worker en los avisos de errores (la del package.json). */
export const WORKER_VERSION = '0.1.0';

export interface FailedJob {
  name: string;
  attemptsMade: number;
  opts: { attempts?: number };
}

/**
 * Qué fallos de trabajos se avisan (fase B4) y cómo:
 * - solo el último intento: los reintentos intermedios no;
 * - nunca un UnrecoverableError: es un fallo de la fuente que la persona resuelve (perfil privado, clave no válida…) y
 *   que la app ya le enseña;
 * - un proveedor caído tras todos los reintentos, como «warning» con su código; cualquier otro error, como «error».
 * Las etiquetas son la cola y el tipo de trabajo, nunca sus datos (llevan IDs de personas y conexiones).
 */
export function failedJobReport(queue: string, job: FailedJob | undefined, error: Error): ErrorContext | null {
  if (error.name === 'UnrecoverableError') return null;
  if (job && job.attemptsMade < (job.opts.attempts ?? 1)) return null;
  const source = isSourceError(error);
  return {
    level: source ? 'warning' : 'error',
    tags: { queue, job: job?.name ?? '(sin trabajo)', ...(source ? { source_error: error.code } : {}) },
  };
}
