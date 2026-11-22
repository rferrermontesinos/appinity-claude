import { Controller, Get, Inject, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { AffinityDto, CategoryRankingDto, DefiningTastesDto, PublicPersonDto, SharedTastesDto, SoulmatesDto } from '@appinity/shared';
import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { publicBaseUrl } from '../common/base-url.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { PeopleService } from './people.service.js';

@Controller('v1')
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** «Lo que te define»: tus obras más características (solo tú las ves). */
  @Get('me/defining')
  defining(@CurrentUser() auth: AuthContext, @Req() req: Request): Promise<DefiningTastesDto> {
    return this.people.defining(auth.userId, publicBaseUrl(req, this.env));
  }

  /** «Lo que os une»: hasta 5 obras que os gustan a los dos, las más raras primero (recíproco y desactivable). */
  @Get('people/:userId/shared')
  shared(@CurrentUser() auth: AuthContext, @Param('userId', new ParseUUIDPipe()) userId: string, @Req() req: Request): Promise<SharedTastesDto> {
    return this.people.shared(auth.userId, userId, publicBaseUrl(req, this.env));
  }

  /** Top 50 almas gemelas (versión gratuita). Si hay menos candidatas válidas, se devuelven las que existan. */
  @Get('me/soulmates')
  soulmates(@CurrentUser() auth: AuthContext): Promise<SoulmatesDto> {
    return this.people.soulmates(auth.userId);
  }

  /** Orden personal del mosaico de categorías (afinidad con tus almas gemelas y gusto propio). */
  @Get('me/categories/ranking')
  categoryRanking(@CurrentUser() auth: AuthContext): Promise<CategoryRankingDto> {
    return this.people.categoryRanking(auth.userId);
  }

  /** Afinidad «yo → otra persona», global y por categoría. */
  @Get('me/affinities/:userId')
  affinity(@CurrentUser() auth: AuthContext, @Param('userId', new ParseUUIDPipe()) userId: string): Promise<AffinityDto> {
    return this.people.affinity(auth.userId, userId);
  }

  /** Perfil público mínimo: nombre, país, foto y afinidades. Nunca historiales. */
  @Get('people/:userId')
  person(@CurrentUser() auth: AuthContext, @Param('userId', new ParseUUIDPipe()) userId: string): Promise<PublicPersonDto> {
    return this.people.person(auth.userId, userId);
  }
}
