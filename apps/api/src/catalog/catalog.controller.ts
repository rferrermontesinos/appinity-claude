import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { CATEGORIES, type CatalogItemDto, type Page } from '@appinity/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { publicBaseUrl } from '../common/base-url.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { CatalogQueryService } from './catalog-query.service.js';

const listSchema = z
  .object({
    category: z.enum(CATEGORIES).optional(),
    includeChildren: z.enum(['true', 'false']).default('false'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.coerce.number().int().min(0).default(0),
  })
  .strict();

/** Catálogo (no recomendaciones): objetos del dataset del usuario con imagen o fallback. */
@Controller('v1/catalog/items')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogQueryService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>,
    @Req() req: Request,
  ): Promise<Page<CatalogItemDto> & { total: number }> {
    return this.catalog.list(
      auth.dataset,
      {
        ...(query.category ? { category: query.category } : {}),
        includeChildren: query.includeChildren === 'true',
        limit: query.limit,
        offset: query.cursor,
      },
      publicBaseUrl(req, this.env),
    );
  }

  @Get(':id')
  get(@CurrentUser() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request): Promise<CatalogItemDto> {
    return this.catalog.get(auth.dataset, id, publicBaseUrl(req, this.env));
  }
}
