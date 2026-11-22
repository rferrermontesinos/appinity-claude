import { installProcessHandlers, type ErrorReporter } from '@appinity/observability';
import { createApp, logger } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { ERROR_REPORTER } from './infra/tokens.js';
import { legalInfoFromEnv, missingLegalInfo } from './legal/texts.js';

const env = loadEnv();
const app = await createApp(env);
const reporter = app.get<ErrorReporter>(ERROR_REPORTER);
// Con avisos activos, un error que nadie captura se avisa antes de terminar el proceso (como haría Node, con código 1).
installProcessHandlers(reporter, (message) => logger.error(message));
await app.listen(env.API_PORT, env.API_HOST);

logger.log(`API escuchando en http://${env.API_HOST}:${env.API_PORT} (NODE_ENV=${env.NODE_ENV})`);
if (env.DEMO_MODE) logger.warn('DEMO_MODE activo: datos simulados e identidad de desarrollo habilitados');
logger.log(
  reporter.enabled ? `Avisos de errores activos (Sentry, entorno ${env.SENTRY_ENVIRONMENT ?? env.NODE_ENV})` : 'Avisos de errores apagados (sin SENTRY_DSN)',
);
const missingLegal = missingLegalInfo(legalInfoFromEnv(env));
if (env.NODE_ENV === 'production' && missingLegal.length) {
  logger.warn(`Textos legales con huecos «[pendiente: …]»: falta ${missingLegal.join(' y ')} (ver docs/operations.md)`);
}
if (env.API_HOST === '0.0.0.0') {
  logger.log('Accesible desde la red local: usa la IP del PC en el teléfono (pnpm doctor la muestra)');
}
