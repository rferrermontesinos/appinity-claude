import { Body, Controller, Get, Headers, HttpCode, Inject, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import { applyRevenueCatEvent } from '@appinity/ingestion';
import type { PremiumDto } from '@appinity/shared';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../common/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { DATABASE } from '../infra/tokens.js';
import { PremiumService } from './premium.service.js';

const ms = z.number().int().nonnegative().nullable().optional();
const ids = z.array(z.string().max(200)).max(100).nullable().optional();
const webhookSchema = z.object({
  event: z
    .object({
      id: z.string().min(1).max(200),
      type: z.string().min(1).max(60),
      app_user_id: z.string().max(200).nullable().optional(),
      original_app_user_id: z.string().max(200).nullable().optional(),
      aliases: ids,
      transferred_from: ids,
      transferred_to: ids,
      entitlement_ids: ids,
      product_id: z.string().max(200).nullable().optional(),
      expiration_at_ms: ms,
      event_timestamp_ms: ms,
      environment: z.string().max(20).nullable().optional(),
    })
    .passthrough(),
});

/** Comparación en tiempo constante (sobre el hash, para no filtrar la longitud). */
function sameSecret(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Premium (fase 12B). El estado lo decide solo el servidor a partir de los webhooks de RevenueCat; la app no puede
 * declararse Premium. El webhook responde 200 deprisa (RevenueCat corta a los 60 s y reintenta si no es 200).
 */
@Controller()
export class PremiumController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly premium: PremiumService,
  ) {}

  @Get('v1/me/premium')
  async status(@CurrentUser() auth: AuthContext): Promise<PremiumDto> {
    const status = await this.premium.status(auth.userId);
    return { ...status, source: 'revenuecat', webhookConfigured: this.premium.webhookConfigured, purchasesInApp: false };
  }

  @Public()
  @SkipThrottle()
  @Post('v1/webhooks/revenuecat')
  @HttpCode(200)
  async webhook(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodPipe(webhookSchema)) body: z.infer<typeof webhookSchema>,
  ): Promise<{ ok: true; outcome: string }> {
    const secret = this.env.REVENUECAT_WEBHOOK_AUTH;
    if (!secret) throw new ServiceUnavailableException('Webhook de RevenueCat no configurado');
    if (!sameSecret(authorization, secret)) throw new UnauthorizedException();
    const outcome = await applyRevenueCatEvent(this.database.db, body.event, { entitlementId: this.premium.entitlementId });
    return { ok: true, outcome };
  }
}
