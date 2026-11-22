import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { catalogItems, userItemObservations, userItemProfiles, type DatabaseHandle } from '@appinity/database';
import {
  CATEGORIES,
  type ItemProfileDetailDto,
  type ItemProfileDto,
  type ObservationDto,
} from '@appinity/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CatalogQueryService } from '../catalog/catalog-query.service.js';
import { publicBaseUrl } from '../common/base-url.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { DATABASE } from '../infra/tokens.js';

const listSchema = z.object({ category: z.enum(CATEGORIES).optional() }).strict();

type ProfileRow = typeof userItemProfiles.$inferSelect;

/**
 * Perfil consolidado y evidencias del PROPIO usuario (vista de demo del modelo). Nunca expone observaciones de
 * otras personas: el userId sale de la sesión.
 */
@Controller('v1/me/item-profiles')
export class ItemProfilesController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly catalog: CatalogQueryService,
  ) {}

  private async sourcesByItem(userId: string): Promise<Map<string, string[]>> {
    const rows = await this.database.db
      .selectDistinct({ itemId: userItemObservations.catalogItemId, source: userItemObservations.sourceKey })
      .from(userItemObservations)
      .where(eq(userItemObservations.userId, userId));
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.itemId, [...(map.get(r.itemId) ?? []), r.source].sort());
    return map;
  }

  private toDto(p: ProfileRow, item: ItemProfileDto['item'], sources: string[]): ItemProfileDto {
    return {
      item,
      knownConfidence: p.knownConfidence,
      consumedConfidence: p.consumedConfidence,
      preferenceScore: p.preferenceScore,
      preferenceConfidence: p.preferenceConfidence,
      preferenceBasis: p.preferenceBasis,
      evidenceCount: p.evidenceCount,
      sourceCount: p.sourceCount,
      sources,
      hasConflict: p.hasConflict,
      firstSeenAt: p.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
      consolidationVersion: p.consolidationVersion,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>,
    @Req() req: Request,
  ): Promise<Array<ItemProfileDto & { notes: Record<string, unknown> }>> {
    const rows = await this.database.db
      .select({ profile: userItemProfiles })
      .from(userItemProfiles)
      .innerJoin(catalogItems, eq(catalogItems.id, userItemProfiles.catalogItemId))
      .where(
        and(eq(userItemProfiles.userId, auth.userId), query.category ? eq(catalogItems.category, query.category) : undefined),
      )
      .orderBy(asc(catalogItems.category), asc(catalogItems.normalizedTitle));
    const dtos = await this.catalog.dtos(rows.map((r) => r.profile.catalogItemId), publicBaseUrl(req, this.env));
    const sources = await this.sourcesByItem(auth.userId);
    return rows.map((r) => ({
      ...this.toDto(r.profile, dtos.get(r.profile.catalogItemId)!, sources.get(r.profile.catalogItemId) ?? []),
      notes: r.profile.notes,
    }));
  }

  @Get(':itemId')
  async detail(
    @CurrentUser() auth: AuthContext,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: Request,
  ): Promise<ItemProfileDetailDto & { notes: Record<string, unknown> | null }> {
    const item = await this.catalog.get(auth.dataset, itemId, publicBaseUrl(req, this.env));
    const db = this.database.db;
    const [profile] = await db
      .select()
      .from(userItemProfiles)
      .where(and(eq(userItemProfiles.userId, auth.userId), eq(userItemProfiles.catalogItemId, itemId)));
    const observations = await db
      .select()
      .from(userItemObservations)
      .where(and(eq(userItemObservations.userId, auth.userId), eq(userItemObservations.catalogItemId, itemId)))
      .orderBy(sql`${userItemObservations.occurredAt} desc nulls last`, desc(userItemObservations.syncedAt));
    const sources = [...new Set(observations.map((o) => o.sourceKey))].sort();
    return {
      item,
      profile: profile ? this.toDto(profile, item, sources) : null,
      notes: profile?.notes ?? null,
      observations: observations.map(
        (o): ObservationDto => ({
          id: o.id,
          sourceKey: o.sourceKey,
          connectionId: o.connectionId,
          sourceRecordId: o.sourceRecordId,
          observationKind: o.observationKind,
          mapperVersion: o.mapperVersion,
          knownConfidence: o.knownConfidence,
          consumedConfidence: o.consumedConfidence,
          preferenceScore: o.preferenceScore,
          preferenceConfidence: o.preferenceConfidence,
          preferenceBasis: o.preferenceBasis,
          engagement: (o.engagement as ObservationDto['engagement']) ?? null,
          occurredAt: o.occurredAt?.toISOString() ?? null,
          timestampPrecision: o.timestampPrecision,
          syncedAt: o.syncedAt.toISOString(),
          metadata: o.metadata,
        }),
      ),
    };
  }
}
