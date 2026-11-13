import { Controller, Get, Header } from '@nestjs/common';
import { transparencyFacts } from '@appinity/ingestion';
import type { TransparencyDto } from '@appinity/shared';
import { Public } from '../common/public.decorator.js';

/** «Cómo funciona APPINITY»: cifras y versiones reales del motor (públicas; sin datos personales). */
@Controller('v1/transparency')
export class TransparencyController {
  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  facts(): TransparencyDto {
    return transparencyFacts();
  }
}
