import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ConflictError, ForbiddenError, NotFoundError, UnavailableError } from '@appinity/ingestion';
import { SourceError } from '@appinity/shared';
import type { Response } from 'express';

/** Traduce los errores de dominio y de fuentes a respuestas HTTP sin filtrar detalles internos ni secretos. */
@Catch(NotFoundError, ConflictError, ForbiddenError, UnavailableError, SourceError)
export class DomainErrorsFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error instanceof NotFoundError
        ? HttpStatus.NOT_FOUND
        : error instanceof ConflictError
          ? HttpStatus.CONFLICT
          : error instanceof ForbiddenError
            ? HttpStatus.FORBIDDEN
            : error instanceof SourceError && error.retryable
              ? HttpStatus.SERVICE_UNAVAILABLE
              : HttpStatus.UNPROCESSABLE_ENTITY;
    response.status(status).json({ statusCode: status, error: HttpStatus[status], message: error.message });
  }
}
