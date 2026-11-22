import { Global, Inject, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@appinity/database';
import { Redis } from 'ioredis';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { DATABASE, REDIS } from './tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): DatabaseHandle =>
        createDatabase(env.DATABASE_URL, { max: 10, applicationName: 'appinity-claude-api' }),
    },
    {
      provide: REDIS,
      inject: [APP_ENV],
      // Productor: falla rápido si Redis no responde en lugar de bloquear peticiones HTTP.
      useFactory: (env: AppEnv): Redis =>
        new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false }),
    },
  ],
  exports: [DATABASE, REDIS],
})
export class InfraModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Infra');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Espera a Redis al arrancar (máx. 5 s). Si no llega, la API arranca y /health lo indica. */
  async onModuleInit(): Promise<void> {
    if (this.redis.status === 'ready') return;
    const ready = await Promise.race([
      new Promise<boolean>((resolve) => this.redis.once('ready', () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000).unref()),
    ]);
    if (!ready) this.logger.warn('Redis no está disponible: /health lo mostrará como caído');
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.database.close(), this.redis.quit()]);
  }
}
