import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/public.decorator.js';
import { PRIVACY_ES, TERMS_ES, legalPage } from './texts.js';

/** Páginas públicas de condiciones y privacidad (las enlaza el alta y las pide la verificación de Google). */
@Controller('legal')
export class LegalController {
  @Public()
  @Get('privacidad')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  privacy(): string {
    return legalPage('Política de privacidad', PRIVACY_ES);
  }

  @Public()
  @Get('condiciones')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  terms(): string {
    return legalPage('Condiciones de uso', TERMS_ES);
  }
}
