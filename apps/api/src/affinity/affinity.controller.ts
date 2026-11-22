import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { categoryAffinities, userAffinities, users, type DatabaseHandle } from '@appinity/database';
import { NotFoundError, isExceptionalMutual } from '@appinity/ingestion';
import { CATEGORIES, type AffinityDto } from '@appinity/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DATABASE } from '../infra/tokens.js';

/**
 * Afinidad del usuario de la sesión hacia otra persona (§4 y §11): global y por categoría, sin revelar qué objetos
 * coinciden ni historiales. La dirección es siempre «yo → otra persona»; de la inversa solo se expone si ambas son
 * ≥ 90 («Afinidad mutua excepcional»). Solo entre personas del mismo dataset (la demo no se mezcla con cuentas reales).
 */
@Controller('v1/me/affinities')
export class AffinityController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  @Get(':userId')
  async get(@CurrentUser() auth: AuthContext, @Param('userId', new ParseUUIDPipe()) targetUserId: string): Promise<AffinityDto> {
    const db = this.database.db;
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.dataset, auth.dataset), eq(users.status, 'active'), isNull(users.deletedAt)));
    if (!target || targetUserId === auth.userId) throw new NotFoundError('Persona no encontrada');

    const [global] = await db
      .select()
      .from(userAffinities)
      .where(and(eq(userAffinities.sourceUserId, auth.userId), eq(userAffinities.targetUserId, targetUserId)));
    const [reverse] = await db
      .select({ score: userAffinities.score })
      .from(userAffinities)
      .where(and(eq(userAffinities.sourceUserId, targetUserId), eq(userAffinities.targetUserId, auth.userId)));
    const rows = await db
      .select()
      .from(categoryAffinities)
      .where(and(eq(categoryAffinities.sourceUserId, auth.userId), eq(categoryAffinities.targetUserId, targetUserId)));
    const byCategory = new Map(rows.map((r) => [r.category, r]));

    return {
      targetUserId,
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
}
