/** Motivos de fallo de una fuente externa, con indicación de si tiene sentido reintentar. */
export type SourceErrorCode =
  | 'not_configured'
  | 'auth'
  | 'rate_limited'
  | 'unavailable'
  | 'profile_inaccessible'
  | 'bad_response'
  | 'verification_failed';

/**
 * Error de una fuente de perfil. `retryable = false` indica que reintentar no servirá (clave inválida, perfil
 * privado…) y que el usuario debe actuar; el mensaje es accionable y nunca contiene secretos.
 */
export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export function isSourceError(error: unknown): error is SourceError {
  return error instanceof Error && error.name === 'SourceError' && 'retryable' in error;
}
