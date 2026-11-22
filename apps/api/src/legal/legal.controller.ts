import { Controller, Get, Header, Inject } from '@nestjs/common';
import { Public } from '../common/public.decorator.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { accountDeletionHtml, legalInfoFromEnv, legalPage, privacyHtml, termsHtml } from './texts.js';

/**
 * Páginas públicas de condiciones, privacidad y eliminación de la cuenta (las enlaza el alta y las piden la verificación
 * de Google y la ficha de Google Play). Los datos del responsable salen de LEGAL_*; se generan una vez al arrancar.
 */
@Controller('legal')
export class LegalController {
  private readonly pages: { privacy: string; terms: string; deletion: string };

  constructor(@Inject(APP_ENV) env: AppEnv) {
    const info = legalInfoFromEnv(env);
    this.pages = {
      privacy: legalPage('Política de privacidad', privacyHtml(info, { errorReports: Boolean(env.SENTRY_DSN) })),
      terms: legalPage('Condiciones de uso', termsHtml(info)),
      deletion: legalPage('Eliminar tu cuenta', accountDeletionHtml(info)),
    };
  }

  @Public()
  @Get('privacidad')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  privacy(): string {
    return this.pages.privacy;
  }

  @Public()
  @Get('condiciones')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  terms(): string {
    return this.pages.terms;
  }

  /** Pedir la baja sin instalar la app (requisito de Google Play). */
  @Public()
  @Get('eliminar-cuenta')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  deletion(): string {
    return this.pages.deletion;
  }
}
