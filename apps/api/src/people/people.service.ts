import { Inject, Injectable } from '@nestjs/common';
import { categoryAffinities, userAffinities, userProfiles, userSettings, type DatabaseHandle } from '@appinity/database';
import { AFFINITY_VERSION, FREE_SOULMATES_LIMIT, NotFoundError, PREMIUM_SOULMATES_LIMIT, CATEGORY_RANKING_VERSION, canSeePerson, categoryRankingFor, chatState, definingTastes, followState, friendshipState, isExceptionalMutual, sharedTastes, topSoulmates, type TasteRef } from '@appinity/ingestion';
import { CATEGORIES, type AffinityDto, type CategoryRankingDto, type DefiningTastesDto, type PublicPersonDto, type SharedTastesDto, type SoulmatesDto, type TasteItemDto } from '@appinity/shared';
import { and, eq } from 'drizzle-orm';
import { CatalogQueryService } from '../catalog/catalog-query.service.js';
import { DATABASE } from '../infra/tokens.js';
import { PremiumService } from '../premium/premium.service.js';

/**
 * Personas: ranking de almas gemelas y perfil público mínimo (§4). Nunca expone historiales importados: solo nombre,
 * país, foto y cifras de afinidad y, desde el 2026-10-27, «Lo que os une» (hasta 5 obras que os gustan a los dos,
 * recíproco y desactivable; ver shared-tastes.ts). Toda consulta parte del usuario de la sesión.
 */
@Injectable()
export class PeopleService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly premium: PremiumService,
    private readonly catalog: CatalogQueryService,
  ) {}

  async shared(viewerId: string, targetId: string, baseUrl: string): Promise<SharedTastesDto> {
    if (viewerId === targetId || !(await canSeePerson(this.database.db, viewerId, targetId))) throw new NotFoundError('Persona no encontrada');
    const result = await sharedTastes(this.database.db, viewerId, targetId);
    return { ...result, items: await this.withItems(result.items, baseUrl) };
  }

  async defining(userId: string, baseUrl: string): Promise<DefiningTastesDto> {
    return { items: await this.withItems(await definingTastes(this.database.db, userId), baseUrl) };
  }

  private async withItems(refs: TasteRef[], baseUrl: string): Promise<TasteItemDto[]> {
    const dtos = await this.catalog.dtos(refs.map((r) => r.itemId), baseUrl);
    return refs.flatMap((r) => {
      const item = dtos.get(r.itemId);
      return item ? [{ item, rarity: r.rarity }] : [];
    });
  }

  async soulmates(userId: string): Promise<SoulmatesDto> {
    // Premium explora más personas; el consenso del recomendador sigue usando el Top 50.
    const limit = (await this.premium.isPremium(userId)) ? PREMIUM_SOULMATES_LIMIT : FREE_SOULMATES_LIMIT;
    const rows = await topSoulmates(this.database.db, userId, limit);
    return {
      items: rows.map((r) => ({
        rank: r.rank,
        userId: r.userId,
        displayName: r.displayName,
        countryCode: r.countryCode,
        avatarUrl: r.avatarUrl,
        score: r.score,
        confidence: r.confidence,
        categoriesCompared: r.categoriesCompared,
        exceptionalMutual: r.exceptionalMutual,
      })),
      limit,
      algorithmVersion: AFFINITY_VERSION,
    };
  }

  /** Afinidad «yo → otra persona». 404 si no puede verla (otro dataset, inactiva, bloqueo o ella misma). */
  async affinity(viewerId: string, targetId: string): Promise<AffinityDto> {
    if (!(await canSeePerson(this.database.db, viewerId, targetId))) throw new NotFoundError('Persona no encontrada');
    const db = this.database.db;
    const [global] = await db
      .select()
      .from(userAffinities)
      .where(and(eq(userAffinities.sourceUserId, viewerId), eq(userAffinities.targetUserId, targetId)));
    const [reverse] = await db
      .select({ score: userAffinities.score })
      .from(userAffinities)
      .where(and(eq(userAffinities.sourceUserId, targetId), eq(userAffinities.targetUserId, viewerId)));
    const rows = await db
      .select()
      .from(categoryAffinities)
      .where(and(eq(categoryAffinities.sourceUserId, viewerId), eq(categoryAffinities.targetUserId, targetId)));
    const byCategory = new Map(rows.map((r) => [r.category, r]));
    return {
      targetUserId: targetId,
      // NULL: sin evidencia comparable suficiente (la app muestra «—», nunca 0 %).
      score: global?.score ?? null,
      confidence: global?.confidence ?? null,
      categoriesCompared: global?.categoriesCompared ?? 0,
      categories: CATEGORIES.map((category) => {
        const row = byCategory.get(category);
        return { category, score: row?.score ?? null, confidence: row?.confidence ?? null, commonItems: row?.commonItems ?? 0 };
      }),
      exceptionalMutual: isExceptionalMutual(global?.score ?? null, reverse?.score ?? null),
      algorithmVersion: global?.algorithmVersion ?? null,
      computedAt: global?.computedAt.toISOString() ?? null,
    };
  }

  async person(viewerId: string, targetId: string): Promise<PublicPersonDto> {
    const affinity = await this.affinity(viewerId, targetId);
    const [profile] = await this.database.db.select().from(userProfiles).where(eq(userProfiles.userId, targetId));
    return {
      userId: targetId,
      displayName: profile?.displayName ?? '—',
      countryCode: profile?.countryCode ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      affinity,
      friendship: await friendshipState(this.database.db, viewerId, targetId),
      chat: await chatState(this.database.db, viewerId, targetId),
      follow: await followState(this.database.db, viewerId, targetId),
      creator: await this.creatorOf(targetId),
    };
  }

  async categoryRanking(userId: string): Promise<CategoryRankingDto> {
    return { version: CATEGORY_RANKING_VERSION, items: await categoryRankingFor(this.database.db, userId) };
  }

  private async creatorOf(userId: string): Promise<{ public: boolean; verified: boolean }> {
    const [s] = await this.database.db
      .select({ creator: userSettings.publicCreator, verifiedAt: userSettings.creatorVerifiedAt })
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return { public: s?.creator ?? false, verified: Boolean(s?.creator && s.verifiedAt) };
  }
}
