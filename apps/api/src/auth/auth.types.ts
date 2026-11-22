import type { Request } from 'express';

/** Identidad resuelta por el guard. Nunca contiene tokens de proveedores. */
export interface AuthContext {
  userId: string;
  dataset: 'demo' | 'live';
  /** dev: identidad de desarrollo (DEMO_MODE); user: sesión de producción. */
  kind: 'dev' | 'user';
  /** Solo en sesiones de producción (para cerrarlas). */
  sessionId?: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}
