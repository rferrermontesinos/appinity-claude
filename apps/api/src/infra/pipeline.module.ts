import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { EntityResolver, LocalDiskStorage, WikidataSnapshotProvider } from '@appinity/catalog';
import type { DatabaseHandle } from '@appinity/database';
import { createProducerQueues, type ProducerQueues } from '@appinity/ingestion';
import { createAdapterRegistry, portabilityGroups } from '@appinity/integrations';
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
          ...(env.TRAKT_CLIENT_ID
            ? { trakt: { clientId: env.TRAKT_CLIENT_ID, redirectUri: env.TRAKT_REDIRECT_URI, ...(env.TRAKT_CLIENT_SECRET ? { clientSecret: env.TRAKT_CLIENT_SECRET } : {}) } }
            : {}),
          ...(env.ANILIST_CLIENT_ID && env.ANILIST_CLIENT_SECRET
            ? { anilist: { clientId: env.ANILIST_CLIENT_ID, clientSecret: env.ANILIST_CLIENT_SECRET, redirectUri: env.ANILIST_REDIRECT_URI } }
            : {}),
          // La API solo conecta y desconecta Google; la identificación de catálogo la hace el worker al sincronizar.
          ...(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
            ? {
                google: {
                  clientId: env.GOOGLE_OAUTH_CLIENT_ID,
                  clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
                  redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
                  // Sin evaluación CASA (de pago), producción solo pide los grupos sensibles.
                  groups: portabilityGroups((env.GOOGLE_RESTRICTED_SCOPES ?? (env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true'),
                },
                googleBooks: {
                  clientId: env.GOOGLE_OAUTH_CLIENT_ID,
                  clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
                  redirectUri: env.GOOGLE_BOOKS_REDIRECT_URI,
                },
                googleCalendar: { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET },
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
