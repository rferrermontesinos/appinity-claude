import { Inject, Injectable } from '@nestjs/common';
import { CHAT_LIMITS, type ChatPolicy } from '@appinity/ingestion';
import type { ChatConfigDto } from '@appinity/shared';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { PremiumService } from '../premium/premium.service.js';

/**
 * Flags de mensajería (§16) y entitlement Premium, verificado en servidor con los webhooks de RevenueCat (fase 12B).
 */
@Injectable()
export class ChatPolicyService implements ChatPolicy {
  readonly earlyAccess: boolean;
  readonly premiumDirectMessage: boolean;
  readonly soulmateChatRequiresPremium: boolean;

  constructor(
    @Inject(APP_ENV) env: AppEnv,
    private readonly premium: PremiumService,
  ) {
    this.earlyAccess = env.CHAT_EARLY_ACCESS;
    this.premiumDirectMessage = env.CHAT_PREMIUM_DIRECT_MESSAGE;
    this.soulmateChatRequiresPremium = env.CHAT_SOULMATES_PREMIUM;
  }

  isPremium(userId: string): Promise<boolean> {
    return this.premium.isPremium(userId);
  }

  async config(userId: string): Promise<ChatConfigDto> {
    return {
      earlyAccess: this.earlyAccess,
      premiumDirectMessage: this.premiumDirectMessage,
      premium: await this.premium.isPremium(userId),
      premiumSource: 'revenuecat',
      limits: {
        requestsPerDay: CHAT_LIMITS.requestsPerDay,
        messagesPerMinute: CHAT_LIMITS.messagesPerMinute,
        messagesPerDay: CHAT_LIMITS.messagesPerDay,
        bodyMaxLength: CHAT_LIMITS.bodyMaxLength,
      },
    };
  }
}
