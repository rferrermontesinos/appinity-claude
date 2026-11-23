import { type ArgumentsHost, Catch, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError, UnavailableError } from '@appinity/ingestion';
import type { ErrorReporter } from '@appinity/observability';
import { isSourceError } from '@appinity/shared';
import type { Request, Response } from 'express';
import { ERROR_REPORTER } from '../infra/tokens.js';

/** Código HTTP de un error de dominio o de una fuente; undefined si el error no es de esos. */
export function domainErrorStatus(error: unknown): HttpStatus | undefined {
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ConflictError) return HttpStatus.CONFLICT;
  if (error instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
  if (error instanceof RateLimitedError) return HttpStatus.TOO_MANY_REQUESTS;
  if (isSourceError(error)) return error.retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.UNPROCESSABLE_ENTITY;
  if (error instanceof UnavailableError) return HttpStatus.UNPROCESSABLE_ENTITY;
  return undefined;
}

/**
 * Qué se avisa: los fallos del servidor (5xx). No los 503, que son «no configurado», Redis caído o un proveedor caído
 * (lo muestran /health y los registros), ni los errores de quien llama (4xx).
 */
export function shouldReportStatus(status: number): boolean {
  return status >= 500 && status !== HttpStatus.SERVICE_UNAVAILABLE;
}

/**
 * Filtro único de la API (fase B4):
 * - traduce los errores de dominio y de fuentes a respuestas HTTP sin filtrar detalles internos (antes,
 *   DomainErrorsFilter);
 * - el resto lo responde Nest como siempre (HttpException con su código; lo desconocido, 500 genérico);
 * - avisa de los 5xx (salvo 503) con la ruta como patrón («GET /v1/people/:id»), nunca la URL con identificadores ni la
 *   petición.
 * Es uno solo porque Nest prueba los filtros globales en orden inverso y uno que lo captura todo taparía al de dominio.
 */
@Catch()
export class ApiExceptionsFilter extends BaseExceptionFilter {
  constructor(@Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter) {
    super();
  }

  override catch(error: unknown, host: ArgumentsHost): void {
    const domainStatus = domainErrorStatus(error);
    if (domainStatus !== undefined) {
      const response = host.switchToHttp().getResponse<Response>();
      response.status(domainStatus).json({ statusCode: domainStatus, error: HttpStatus[domainStatus], message: (error as Error).message });
      return;
    }
    const status = error instanceof HttpException ? error.getStatus() : this.isHttpError(error) ? error.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;
    if (this.reporter.enabled && shouldReportStatus(status)) {
      const request = host.switchToHttp().getRequest<Request>();
      const routePath = (request.route as { path?: unknown } | undefined)?.path;
      this.reporter.captureException(error, {
        tags: { route: `${request.method} ${typeof routePath === 'string' ? routePath : '(sin ruta)'}`, status },
      });
    }
    super.catch(error, host);
  }
}
