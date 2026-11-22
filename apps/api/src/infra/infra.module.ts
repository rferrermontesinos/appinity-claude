import { Global, Inject, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@appinity/database';
import { createErrorReporter, type ErrorReporter } from '@appinity/observability';
import { Redis } from 'ioredis';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { API_VERSION } from '../version.js';
import { DATABASE, ERROR_REPORTER, REDIS } from './tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): DatabaseHandle => createDatabase(env.DATABASE_URL, { max: 10, applicationName: 'appinity-claude-api' }),
    },
    {
      provide: REDIS,
      inject: [APP_ENV],
      // Productor: falla rápido si Redis no responde en lugar de bloquear peticiones HTTP.
      useFactory: (env: AppEnv): Redis => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false }),
    },
    {
      provide: ERROR_REPORTER,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): ErrorReporter =>
        createErrorReporter({
          dsn: env.SENTRY_DSN,
          service: 'api',
          environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
          release: `appinity-api@${API_VERSION}`,
        }),
    },
  ],
  exports: [DATABASE, REDIS, ERROR_REPORTER],
})
export class InfraModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Infra');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
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
    // Los avisos pendientes salen antes de cerrar (2 s como mucho).
    await Promise.allSettled([this.reporter.flush(2_000), this.database.close(), this.redis.quit()]);
  }
}
