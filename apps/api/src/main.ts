import { createApp, logger } from './bootstrap.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.API_PORT, env.API_HOST);

logger.log(`API escuchando en http://${env.API_HOST}:${env.API_PORT} (NODE_ENV=${env.NODE_ENV})`);
if (env.DEMO_MODE) logger.warn('DEMO_MODE activo: datos simulados e identidad de desarrollo habilitados');
if (env.API_HOST === '0.0.0.0') {
  logger.log('Accesible desde la red local: usa la IP del PC en el teléfono (pnpm doctor la muestra)');
}
