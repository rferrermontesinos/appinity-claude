import type { Request } from 'express';

/** Identidad resuelta por el guard. Nunca contiene tokens de proveedores. */
export interface AuthContext {
  userId: string;
  dataset: 'demo' | 'live';
  kind: 'dev';
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}
