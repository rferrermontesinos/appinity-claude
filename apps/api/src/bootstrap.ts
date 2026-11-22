import 'reflect-metadata';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.js';

/** Crea la aplicación sin escuchar (la usan main.ts y los tests de integración). */
export async function createApp(env: AppEnv, options: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    logger: options.logger === false ? false : ['error', 'warn', 'log'],
    bodyParser: true,
  });
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useBodyParser('json', { limit: '100kb' });
  // CORS solo para la verificación web en desarrollo (localhost). La app móvil no lo necesita.
  if (env.NODE_ENV !== 'production') {
    app.enableCors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/], credentials: false });
  }
  app.enableShutdownHooks();
  return app;
}

export const logger = new Logger('APPINITY');
