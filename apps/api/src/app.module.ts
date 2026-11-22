import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './auth/auth.guard.js';
import { DevAuthController } from './auth/dev-auth.controller.js';
import { DevAuthService } from './auth/dev-auth.service.js';
import { UsersRepository } from './auth/users.repository.js';
import { APP_ENV, type AppEnv } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { MeController } from './me/me.controller.js';
import { MeService } from './me/me.service.js';

@Module({})
export class AppModule {
  static register(env: AppEnv): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
        { module: ConfigHolderModule, global: true, providers: [{ provide: APP_ENV, useValue: env }], exports: [APP_ENV] },
        InfraModule,
      ],
      controllers: [HealthController, DevAuthController, MeController],
      providers: [
        DevAuthService,
        UsersRepository,
        MeService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}

@Module({})
class ConfigHolderModule {}
