/** Errores de dominio que la API traduce a códigos HTTP. */
export class NotFoundError extends Error {
  readonly code = 'not_found';
}

export class ConflictError extends Error {
  readonly code = 'conflict';
}

export class ForbiddenError extends Error {
  readonly code = 'forbidden';
}

export class UnavailableError extends Error {
  readonly code = 'unavailable';
}

/** La conexión se revocó mientras el sync estaba en curso: no se escribe nada más. */
export class ConnectionRevokedError extends Error {
  readonly code = 'revoked';
}
