import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ErrorReporter } from '@appinity/observability';
import { appErrorReportSchema, type AppErrorReportDto } from '@appinity/shared';
import { Public } from '../common/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ERROR_REPORTER } from '../infra/tokens.js';

/** Avisos de la app que este proceso reenvía como mucho por hora, aunque lleguen desde muchas IP. */
export const APP_ERRORS_PER_HOUR = 100;

/**
 * Errores de JavaScript de la app (fase B4). La app no lleva el SDK de Sentry ni su DSN: envía aquí el error y la API lo
 * reenvía con el mismo filtro de privacidad que sus propios avisos. Es público porque los fallos más graves ocurren antes
 * de tener sesión (arranque, entrada, alta) y así tampoco se asocia el aviso a nadie. Contra el abuso: límite por IP, un
 * cupo por hora en el proceso y el límite por clave que se configura en Sentry (docs/operations.md). Sin SENTRY_DSN
 * responde igual y no envía nada.
 */
@Controller('v1/diagnostics')
export class DiagnosticsController {
  private windowStartedAt = 0;
  private forwardedInWindow = 0;

  constructor(@Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter) {}

  @Public()
  @Post('app-errors')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  appError(@Body(new ZodPipe(appErrorReportSchema)) body: AppErrorReportDto): void {
    if (!this.reporter.enabled || !this.takeHourlySlot()) return;
    this.reporter.captureAppError(body);
  }

  private takeHourlySlot(now = Date.now()): boolean {
    if (now - this.windowStartedAt >= 3_600_000) {
      this.windowStartedAt = now;
      this.forwardedInWindow = 0;
    }
    if (this.forwardedInWindow >= APP_ERRORS_PER_HOUR) return false;
    this.forwardedInWindow += 1;
    return true;
  }
}
