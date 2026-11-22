import { Inject, Injectable } from '@nestjs/common';
import { CHAT_LIMITS, type ChatPolicy } from '@appinity/ingestion';
import type { ChatConfigDto } from '@appinity/shared';
import { APP_ENV, type AppEnv } from '../config/env.js';

/**
 * Flags de mensajería (§16) y entitlement Premium. No hay RevenueCat todavía (fase 12B): nadie es Premium y el envío
 * directo devuelve 403 aunque el flag esté activo. No se simula ningún entitlement.
 */
@Injectable()
export class ChatPolicyService implements ChatPolicy {
  readonly earlyAccess: boolean;
  readonly premiumDirectMessage: boolean;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.earlyAccess = env.CHAT_EARLY_ACCESS;
    this.premiumDirectMessage = env.CHAT_PREMIUM_DIRECT_MESSAGE;
  }

  isPremium(): boolean {
    return false;
  }

  config(): ChatConfigDto {
    return {
      earlyAccess: this.earlyAccess,
      premiumDirectMessage: this.premiumDirectMessage,
      premium: false,
      premiumSource: 'none',
      limits: {
        requestsPerDay: CHAT_LIMITS.requestsPerDay,
        messagesPerMinute: CHAT_LIMITS.messagesPerMinute,
        messagesPerDay: CHAT_LIMITS.messagesPerDay,
        bodyMaxLength: CHAT_LIMITS.bodyMaxLength,
      },
    };
  }
}
