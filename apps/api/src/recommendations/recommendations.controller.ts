import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import { recommendFor } from '@appinity/ingestion';
import { CATEGORIES, type RecommendationsDto } from '@appinity/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CatalogQueryService } from '../catalog/catalog-query.service.js';
import { publicBaseUrl } from '../common/base-url.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { DATABASE } from '../infra/tokens.js';

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(30),
    category: z.enum(CATEGORIES).optional(),
    /** Ids ya mostrados en la sesión, separados por comas (sin repetir tarjetas). */
    exclude: z
      .string()
      .max(5_000)
      .optional()
      .transform((v) => (v ? v.split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : [])),
    /** Home aplica los descartes; Categories (fase 9) no. */
    context: z.enum(['home', 'category']).default('home'),
  })
  .strict();

/**
 * Recomendaciones del usuario de la sesión (§12 y §13). Cada tarjeta lleva su motivo verificable: cuántas almas gemelas
 * la apoyan (sin decir quiénes), qué persona la descubrió (nombre, que el motivo permite revelar) o cuántas personas de
 * la zona la votaron este año. Nunca historiales ni ubicaciones individuales.
 */
@Controller('v1/me/recommendations')
export class RecommendationsController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly catalog: CatalogQueryService,
  ) {}

  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    @Req() req: Request,
    @Query(new ZodPipe(querySchema)) query: z.infer<typeof querySchema>,
  ): Promise<RecommendationsDto> {
    const result = await recommendFor(this.database.db, auth.userId, {
      limit: query.limit,
      ...(query.category ? { category: query.category } : {}),
      excludeItemIds: query.exclude,
      applyHomeDismissals: query.context === 'home',
    });
    const cards = await this.catalog.dtos(
      result.items.map((r) => r.itemId),
      publicBaseUrl(req, this.env),
    );
    return {
      items: result.items.flatMap((r) => {
        const item = cards.get(r.itemId);
        if (!item) return [];
        return [
          {
            item,
            block: r.block,
            fillsFor: r.fillsFor,
            isNew: r.isNew,
            reason: {
              code: r.block,
              ...(r.consensus ? { supporters: r.consensus.supporters, opinionated: r.consensus.opinionated } : {}),
              ...(r.discovery ? { contributor: { userId: r.discovery.contributorId, displayName: r.discovery.contributorName } } : {}),
              ...(r.trending ? { positiveVoters: r.trending.positiveVoters, totalVoters: r.trending.totalVoters } : {}),
            },
          },
        ];
      }),
      available: result.available,
      trending: result.trending,
      localFilter: result.localFilter,
      algorithmVersion: result.algorithmVersion,
    };
  }
}
