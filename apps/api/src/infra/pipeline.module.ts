import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { EntityResolver, LocalDiskStorage, WikidataSnapshotProvider } from '@appinity/catalog';
import type { DatabaseHandle } from '@appinity/database';
import { createProducerQueues, type ProducerQueues } from '@appinity/ingestion';
import { TmdbCatalogProvider, createAdapterRegistry } from '@appinity/integrations';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { ADAPTER_REGISTRY, DATABASE, ENTITY_RESOLVER, QUEUES, STORAGE } from './tokens.js';

/**
 * Registro de adapters, resolver de entidades, colas BullMQ (lado productor) y almacenamiento de imágenes.
 * Las fuentes fixture y la instantánea de catálogo solo se cargan con DEMO_MODE; Steam y TMDb, con su configuración.
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
          ...(env.TMDB_API_READ_TOKEN ? { tmdb: { readToken: env.TMDB_API_READ_TOKEN } } : {}),
        }),
    },
    {
      provide: ENTITY_RESOLVER,
      inject: [APP_ENV, DATABASE],
      useFactory: (env: AppEnv, database: DatabaseHandle) =>
        new EntityResolver(database.db, [
          ...(env.DEMO_MODE ? [new WikidataSnapshotProvider()] : []),
          // Solo dataset live: la demo nunca llama a TMDb.
          ...(env.TMDB_API_READ_TOKEN ? [new TmdbCatalogProvider({ readToken: env.TMDB_API_READ_TOKEN })] : []),
        ]),
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
