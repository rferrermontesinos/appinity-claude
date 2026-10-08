import { createDatabase, requireEnv } from '@appinity/database';
import { seedDemo } from '../demo/seed-demo.js';
import { createProducerQueues, enqueueImage } from '../queues.js';

const handle = createDatabase(requireEnv('DATABASE_URL'), { max: 4, applicationName: 'appinity-claude-seed' });
try {
  const summary = await seedDemo(handle);
  console.log(`✔ Usuarios simulados: ${summary.users} (dataset demo)`);
  console.log(`✔ Catálogo real (instantánea Wikidata/Commons): ${summary.catalog.total} objetos, ${summary.catalog.created} nuevos`);
  for (const s of summary.syncs) {
    const errors = s.partialErrors.length ? ` · ${s.partialErrors.length} error(es) parcial(es)` : '';
    console.log(
      `  · ${s.handle.padEnd(11)} ${s.source.padEnd(17)} ${s.status.padEnd(9)} nuevas ${s.observationsInserted}, actualizadas ${s.observationsUpdated}, sin cambios ${s.observationsUnchanged}${errors}`,
    );
  }

  // Caché de imágenes: lo hace el worker. Si Redis no está disponible, la app usa la URL de origen.
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && summary.pendingImageIds.length) {
    const queues = createProducerQueues(redisUrl, process.env.QUEUE_PREFIX ?? 'appinity-claude');
    try {
      for (const id of summary.pendingImageIds) await enqueueImage(queues, id);
      console.log(`✔ ${summary.pendingImageIds.length} imágenes en cola para cachear (las procesa pnpm worker)`);
    } catch (error) {
      console.warn(`⚠ No se pudieron encolar imágenes (${(error as Error).message}); se usarán las URLs de origen`);
    } finally {
      await queues.close();
    }
  } else if (!summary.pendingImageIds.length) {
    console.log('✔ Todas las imágenes del catálogo de demo ya están cacheadas');
  }
} finally {
  await handle.close();
}
