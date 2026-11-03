import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AffinityDto, CategoryRankingDto, PublicPersonDto, SoulmatesDto } from '@appinity/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PeopleService } from './people.service.js';

@Controller('v1')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

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
