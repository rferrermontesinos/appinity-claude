import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { EntityResolver, LocalDiskStorage, WikidataSnapshotProvider } from '@appinity/catalog';
import type { DatabaseHandle } from '@appinity/database';
import { createProducerQueues, type ProducerQueues } from '@appinity/ingestion';
import { createAdapterRegistry } from '@appinity/integrations';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { ADAPTER_REGISTRY, DATABASE, ENTITY_RESOLVER, QUEUES, STORAGE } from './tokens.js';

/**
 * Registro de adapters, resolver de entidades, colas BullMQ (lado productor) y almacenamiento de imágenes.
 * Las fuentes fixture y la instantánea de catálogo solo se cargan con DEMO_MODE.
 */
@Global()
@Module({
  providers: [
    {
      provide: ADAPTER_REGISTRY,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) =>
        createAdapterRegistry({
          demoMode: env.DEMO_MODE,
          ...(env.STEAM_WEB_API_KEY ? { steam: { apiKey: env.STEAM_WEB_API_KEY } } : {}),
          // La API solo conecta y desconecta Google; la identificación de catálogo la hace el worker al sincronizar.
          ...(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
            ? {
                google: {
                  clientId: env.GOOGLE_OAUTH_CLIENT_ID,
                  clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
                  redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
                },
              }
            : {}),
        }),
    },
    {
      provide: ENTITY_RESOLVER,
      inject: [APP_ENV, DATABASE],
      useFactory: (env: AppEnv, database: DatabaseHandle) =>
        new EntityResolver(database.db, env.DEMO_MODE ? [new WikidataSnapshotProvider()] : []),
    },
    {
      provide: QUEUES,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): ProducerQueues => createProducerQueues(env.REDIS_URL, env.QUEUE_PREFIX),
    },
    {
      provide: STORAGE,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => new LocalDiskStorage(env.STORAGE_DIR),
    },
  ],
  exports: [ADAPTER_REGISTRY, ENTITY_RESOLVER, QUEUES, STORAGE],
})
export class PipelineModule implements OnApplicationShutdown {
  constructor(@Inject(QUEUES) private readonly queues: ProducerQueues) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queues.close();
  }
}
