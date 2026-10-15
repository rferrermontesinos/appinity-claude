import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle } from '@appinity/database';
import { premiumStatus, type PremiumEnvironment, type PremiumStatus } from '@appinity/ingestion';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { DATABASE } from '../infra/tokens.js';

/**
 * Entitlement Premium verificado en servidor (fase 12B). Solo cuentan las compras del entorno de esta instalación
 * (sandbox en desarrollo, producción con NODE_ENV=production): una compra de prueba nunca da Premium en producción.
 */
@Injectable()
export class PremiumService {
  readonly environment: PremiumEnvironment;
  readonly entitlementId: string;
  readonly webhookConfigured: boolean;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.environment = env.PREMIUM_ENVIRONMENT ?? (env.NODE_ENV === 'production' ? 'production' : 'sandbox');
    this.entitlementId = env.REVENUECAT_ENTITLEMENT_ID;
    this.webhookConfigured = Boolean(env.REVENUECAT_WEBHOOK_AUTH);
  }

  status(userId: string): Promise<PremiumStatus> {
    return premiumStatus(this.database.db, userId, { entitlementId: this.entitlementId, environment: this.environment });
  }

  async isPremium(userId: string): Promise<boolean> {
    return (await this.status(userId)).premium;
  }
}
