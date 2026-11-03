import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { catalogExpansions, type DatabaseHandle } from '@appinity/database';
import { Throttle } from '@nestjs/throttler';
import { and, eq } from 'drizzle-orm';
import { expandableCategory, recommendFor, type ProducerQueues } from '@appinity/ingestion';
import { CATEGORIES, type CatalogExpansionDto, type RecommendationsDto } from '@appinity/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CatalogQueryService } from '../catalog/catalog-query.service.js';
import { publicBaseUrl } from '../common/base-url.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { DATABASE, QUEUES } from '../infra/tokens.js';

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

const expandSchema = z.object({ category: z.enum(CATEGORIES) }).strict();

const bodySchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(30),
    category: z.enum(CATEGORIES).optional(),
    exclude: z.array(z.uuid()).max(5_000).default([]),
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
    @Inject(QUEUES) private readonly queues: ProducerQueues,
  ) {}

  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Req() req: Request,
    @Query(new ZodPipe(querySchema)) query: z.infer<typeof querySchema>,
  ): Promise<RecommendationsDto> {
    return this.build(auth, req, query);
  }

  /**
   * Ampliar el catálogo de una categoría (Categorías, «Cargar más», 2026-10-27): cuando la lista se agota, el worker
   * trae obras populares de Wikidata, que salen como «para explorar». Un trabajo cada 30 s por categoría y dataset.
   */
  @Post('expand')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async expand(@CurrentUser() auth: AuthContext, @Body(new ZodPipe(expandSchema)) body: z.infer<typeof expandSchema>): Promise<CatalogExpansionDto> {
    if (!expandableCategory(body.category)) return { status: 'not_expandable' };
    const [state] = await this.database.db
      .select({ exhausted: catalogExpansions.exhausted })
      .from(catalogExpansions)
      .where(and(eq(catalogExpansions.dataset, auth.dataset), eq(catalogExpansions.category, body.category)));
    if (state?.exhausted) return { status: 'exhausted' };
    const bucket = Math.floor(Date.now() / 30_000);
    await this.queues.system.add('expand-catalog', { dataset: auth.dataset, category: body.category }, { jobId: `expand-${auth.dataset}-${body.category}-${bucket}` });
    return { status: 'queued' };
  }

  /** Igual que GET, con la cola de la sesión en el cuerpo: un mazo sin fin no cabe en una URL. */
  @Post('query')
  @HttpCode(200)
  query(
    @CurrentUser() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodPipe(bodySchema)) body: z.infer<typeof bodySchema>,
  ): Promise<RecommendationsDto> {
    return this.build(auth, req, body);
  }

  private async build(
    auth: AuthContext,
    req: Request,
    query: { limit: number; category?: (typeof CATEGORIES)[number] | undefined; exclude: string[]; context: 'home' | 'category' },
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
              ...(r.discovery ? { contributor: { userId: r.discovery.contributorId, displayName: r.discovery.contributorName }, contributorFollowed: r.discovery.contributorFollowed } : {}),
              ...(r.followed
                ? { contributor: { userId: r.followed.contributorId, displayName: r.followed.contributorName }, contributorAffinity: r.followed.contributorAffinity }
                : {}),
              ...(r.followedBy ? { followedBy: r.followedBy } : {}),
              ...(r.trending ? { positiveVoters: r.trending.positiveVoters, totalVoters: r.trending.totalVoters } : {}),
              ...(r.community ? { supporters: r.community.supporters } : {}),
              ...(r.content ? { because: { itemId: r.content.becauseItemId, title: r.content.becauseTitle, relation: r.content.relation } } : {}),
              ...(r.evidence ? { evidence: r.evidence } : {}),
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
