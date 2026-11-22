import { Inject, Injectable } from '@nestjs/common';
import { categoryAffinities, userAffinities, userProfiles, type DatabaseHandle } from '@appinity/database';
import { AFFINITY_VERSION, NotFoundError, canSeePerson, friendshipState, isExceptionalMutual, topSoulmates } from '@appinity/ingestion';
import { CATEGORIES, type AffinityDto, type PublicPersonDto, type SoulmatesDto } from '@appinity/shared';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../infra/tokens.js';

/**
 * Personas: ranking de almas gemelas y perfil público mínimo (§4). Nunca expone historiales importados ni qué objetos
 * coinciden: solo nombre, país, foto y cifras de afinidad. Toda consulta parte del usuario de la sesión.
 */
@Injectable()
export class PeopleService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async soulmates(userId: string): Promise<SoulmatesDto> {
    const rows = await topSoulmates(this.database.db, userId);
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
      limit: 50,
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
    };
  }
}
