import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './auth/auth.guard.js';
import { DevAuthController } from './auth/dev-auth.controller.js';
import { DevAuthService } from './auth/dev-auth.service.js';
import { UsersRepository } from './auth/users.repository.js';
import { CatalogQueryService } from './catalog/catalog-query.service.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { MediaController } from './catalog/media.controller.js';
import { DomainErrorsFilter } from './common/domain-errors.filter.js';
import { APP_ENV, type AppEnv } from './config/env.js';
import { ConnectCallbackController } from './connections/connect-callback.controller.js';
import { ConnectionsController } from './connections/connections.controller.js';
import { ConnectionsService } from './connections/connections.service.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { PipelineModule } from './infra/pipeline.module.js';
import { MeController } from './me/me.controller.js';
import { MeService } from './me/me.service.js';
import { ItemProfilesController } from './profiles/item-profiles.controller.js';
import { SourcesController } from './sources/sources.controller.js';

@Module({})
class ConfigHolderModule {}

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
        PipelineModule,
      ],
      controllers: [
        HealthController,
        DevAuthController,
        MeController,
        SourcesController,
        ConnectionsController,
        ConnectCallbackController,
        CatalogController,
        MediaController,
        ItemProfilesController,
      ],
      providers: [
        DevAuthService,
        UsersRepository,
        MeService,
        ConnectionsService,
        CatalogQueryService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: DomainErrorsFilter },
      ],
    };
  }
}
