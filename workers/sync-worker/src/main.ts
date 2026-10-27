import { EntityResolver, LocalDiskStorage, WikidataSnapshotProvider, WikimediaImages, cacheCatalogImage, WikipediaSummaries, enrichDetailsFromWikidata, enrichImagesFromWikidata, enrichPosters, enrichSummariesFromWikipedia } from '@appinity/catalog';
import { createDatabase } from '@appinity/database';
import { buildContentRelations, createProducerQueues, expandCatalog, enqueueAffinity, enqueueImage, enqueueSync, recomputeAffinities, runConnectionSync, scheduleDueSyncs, sendDueDigests, checkDigestReceipts } from '@appinity/ingestion';
import { ExpoPushSender, createAdapterRegistry, createCatalogIdentifier, portabilityGroups } from '@appinity/integrations';
import {
  QUEUES,
  isSourceError,
  workerHeartbeatKey,
  type AffinityJob,
  type CatalogImageJob,
  type PingJob,
  type ExpandCatalogJob,
  isCategory,
  type ProfileSyncJob,
} from '@appinity/shared';
import { DelayedError, Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './env.js';

const env = loadWorkerEnv();
// Los workers de BullMQ exigen maxRetriesPerRequest = null.
const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
const heartbeatClient = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 });
const database = createDatabase(env.databaseUrl, { max: 6, applicationName: 'appinity-claude-worker' });
const catalogIdentifier = createCatalogIdentifier({
  userAgent: env.catalogUserAgent,
  ...(env.nominatimUrl ? { nominatimUrl: env.nominatimUrl } : {}),
  log: (message) => console.log(`[catálogo] ${message}`),
});
const registry = createAdapterRegistry({
  demoMode: env.demoMode,
  ...(env.steamApiKey ? { steam: { apiKey: env.steamApiKey } } : {}),
  ...(process.env.TRAKT_CLIENT_ID?.trim()
    ? {
        trakt: {
          clientId: process.env.TRAKT_CLIENT_ID.trim(),
          redirectUri: process.env.TRAKT_REDIRECT_URI?.trim() || 'http://localhost:3100/v1/connect/trakt/callback',
          ...(process.env.TRAKT_CLIENT_SECRET?.trim() ? { clientSecret: process.env.TRAKT_CLIENT_SECRET.trim() } : {}),
          identifier: catalogIdentifier,
        },
      }
    : {}),
  ...(process.env.ANILIST_CLIENT_ID?.trim() && process.env.ANILIST_CLIENT_SECRET?.trim()
    ? {
        anilist: {
          clientId: process.env.ANILIST_CLIENT_ID.trim(),
          clientSecret: process.env.ANILIST_CLIENT_SECRET.trim(),
          redirectUri: process.env.ANILIST_REDIRECT_URI?.trim() || 'http://localhost:3100/v1/connect/anilist/callback',
          identifier: catalogIdentifier,
        },
      }
    : {}),
  ...(process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim()
    ? {
        facebook: {
          appId: process.env.FACEBOOK_APP_ID.trim(),
          appSecret: process.env.FACEBOOK_APP_SECRET.trim(),
          redirectUri: process.env.FACEBOOK_REDIRECT_URI?.trim() || 'http://localhost:3100/v1/connect/facebook/callback',
          graphVersion: process.env.FACEBOOK_GRAPH_VERSION?.trim() || 'v23.0',
          identifier: catalogIdentifier,
        },
      }
    : {}),
  ...(env.google
    ? {
        google: {
          ...env.google,
          groups: portabilityGroups((process.env.GOOGLE_RESTRICTED_SCOPES?.trim() || (env.nodeEnv === 'production' ? 'false' : 'true')) === 'true'),
          // Lugares con OpenStreetMap y obras con Wikidata (licencias de uso comercial).
          identifier: catalogIdentifier,
          // Estructura del export SIN datos personales: sirve para contrastar el formato real con el documentado.
          onArchiveSummary: (summary) => console.log(`[google] export ${summary.group}: ${JSON.stringify({ ...summary, group: undefined })}`),
          onProgress: (message) => console.log(`[google] ${message}`),
        },
        // Google Books: el worker solo renueva el acceso y sincroniza (la URL de vuelta la usa la API al conectar).
        googleBooks: {
          clientId: env.google.clientId,
          clientSecret: env.google.clientSecret,
          redirectUri: process.env.GOOGLE_BOOKS_REDIRECT_URI?.trim() || 'http://localhost:3100/v1/connect/google_books/callback',
          identifier: catalogIdentifier,
        },
        googleCalendar: { clientId: env.google.clientId, clientSecret: env.google.clientSecret, identifier: catalogIdentifier },
      }
    : {}),
});
const producer = createProducerQueues(env.redisUrl, env.queuePrefix);
const resolver = new EntityResolver(database.db, env.demoMode ? [new WikidataSnapshotProvider()] : []);
const storage = new LocalDiskStorage(env.storageDir);
/** Syncs en curso: al cerrar el worker se devuelven a la cola en vez de esperar a que terminen (pueden tardar minutos). */
const pushSender = new ExpoPushSender(env.expoAccessToken ? { accessToken: env.expoAccessToken } : {});
const activeSyncs = new Map<string, { job: Job<ProfileSyncJob>; token: string | undefined }>();

const workers: Worker[] = [
  new Worker<PingJob, unknown>(
    QUEUES.system,
    async (job) => {
      // Programador: encola syncs periódicos de fuentes reales (sin depender de un botón «Importar»).
      if (job.name === 'schedule-syncs') {
        const due = await scheduleDueSyncs(database, registry, { intervalHours: env.syncIntervalHours });
        for (const item of due) await enqueueSync(producer, item);
        if (due.length) console.log(`[scheduler] ${due.length} sync(s) programado(s)`);
        return { scheduled: due.length };
      }
      // Resúmenes push (fase 12C): a la hora local de cada persona y según su frecuencia; uno al día como mucho.
      if (job.name === 'send-digests') {
        const result = await sendDueDigests(database.db, pushSender);
        if (result.considered) console.log(`[push] resúmenes: ${JSON.stringify(result)}`);
        // Recibos de los envíos de hace más de 15 min (FCM/APNs los aceptaron o no).
        const receipts = await checkDigestReceipts(database.db, pushSender);
        if (receipts.checked) console.log(`[push] recibos: ${JSON.stringify(receipts)}`);
        return { ...result, receipts };
      }
      // Ampliación del catálogo bajo demanda (Categorías, «Cargar más»): obras populares de Wikidata y, de lo nuevo,
      // imágenes y detalles enseguida para que no salgan vacías.
      if (job.name === 'expand-catalog') {
        const data = job.data as unknown as ExpandCatalogJob;
        const popular = catalogIdentifier.popularWorks;
        if (!isCategory(data.category) || !popular) return { skipped: true };
        const result = await expandCatalog(database.db, resolver, { popularWorks: (c, o, l) => popular(c, o, l) }, { dataset: data.dataset, category: data.category });
        if (result.itemsCreated) {
          const wikimedia = new WikimediaImages({ userAgent: env.catalogUserAgent });
          const images = await enrichImagesFromWikidata(database.db, wikimedia, { dataset: data.dataset });
          for (const id of images.imageIds) await enqueueImage(producer, id);
          await enrichDetailsFromWikidata(database.db, wikimedia, { dataset: data.dataset });
          await enrichSummariesFromWikipedia(database.db, new WikipediaSummaries({ userAgent: env.catalogUserAgent }), { dataset: data.dataset });
          await enrichPosters(database.db, { userAgent: env.catalogUserAgent, dataset: data.dataset, ...(env.tmdbApiKey ? { tmdbApiKey: env.tmdbApiKey } : {}) });
        }
        console.log(`[catálogo] ampliación de ${data.category} (${data.dataset}): ${result.itemsCreated} obras nuevas de ${result.requested}${result.exhausted ? ' · fin de la lista' : ''}`);
        return result;
      }
      // Enriquecimiento del catálogo real (prioridad 2 del diagnóstico): imágenes libres de Wikidata y Commons.
      if (job.name === 'enrich-catalog') {
        // Primero las relaciones por contenido (crean objetos nuevos); después, sus imágenes.
        const relations = await buildContentRelations(database.db, resolver, { relatedWorks: (qid, category) => catalogIdentifier.relatedWorks?.(qid, category) ?? Promise.resolve([]) }, { log: (m) => console.log(`[catálogo] ${m}`) });
        if (relations.relations) console.log(`[catálogo] relaciones por contenido: ${JSON.stringify(relations)}`);
        // Al arrancar se revisan también las imágenes ya guardadas con las reglas actuales (cartel o logotipo en cine).
        const refresh = job.data.requestedAt === 'startup';
        const images = await enrichImagesFromWikidata(database.db, new WikimediaImages({ userAgent: env.catalogUserAgent }), { refresh });
        for (const id of images.imageIds) await enqueueImage(producer, id);
        if (images.inserted || images.updated || images.removed)
          console.log(`[catálogo] imágenes de Wikimedia: ${images.inserted} nuevas, ${images.updated} cambiadas, ${images.removed} quitadas (${images.candidates} revisadas)`);
        // Carteles de películas y series (TVmaze; TMDb con clave): prioridad sobre logotipos y fotos de Commons.
        // También la demo: sus obras son reales (Wikidata) y los carteles se sirven por enlace.
        for (const dataset of ['live', 'demo'] as const) {
          const posters = await enrichPosters(database.db, { userAgent: env.catalogUserAgent, dataset, ...(env.tmdbApiKey ? { tmdbApiKey: env.tmdbApiKey } : {}) });
          if (posters.tvmaze || posters.tmdb) console.log(`[catálogo] carteles (${dataset}): ${posters.tvmaze} de TVmaze y ${posters.tmdb} de TMDb (${posters.candidates} revisados)`);
        }
        // Línea de contexto de las tarjetas: descripción, personas y géneros (solo objetos aún no revisados).
        const details = await enrichDetailsFromWikidata(database.db, new WikimediaImages({ userAgent: env.catalogUserAgent }));
        if (details.updated) console.log(`[catálogo] detalles de Wikidata en ${details.updated} objetos`);
        // Sinopsis de la ficha (Wikipedia, CC BY-SA): también la demo, cuyas obras son reales. Un fallo no tumba el resto.
        const summaries: Record<string, unknown> = {};
        for (const dataset of ['live', 'demo'] as const) {
          try {
            const s = await enrichSummariesFromWikipedia(database.db, new WikipediaSummaries({ userAgent: env.catalogUserAgent }), { dataset });
            summaries[dataset] = s;
            if (s.candidates) console.log(`[catálogo] sinopsis de Wikipedia (${dataset}): ${s.withSummary} de ${s.candidates} objetos revisados`);
          } catch (error) {
            console.error(`[catálogo] sinopsis de Wikipedia (${dataset}): ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return { relations, images: { ...images, imageIds: images.imageIds.length }, details, summaries };
      }
      return { pong: `${job.data.requestedAt} → ${new Date().toISOString()}` };
    },
    { connection, prefix: env.queuePrefix, concurrency: 1 },
  ),
  // Syncs de fuentes de perfil. El bloqueo por conexión vive en PostgreSQL (runConnectionSync).
  new Worker<ProfileSyncJob>(
    QUEUES.profileSync,
    async (job, token) => {
      let outcome;
      activeSyncs.set(job.id!, { job, token });
      try {
        outcome = await runConnectionSync(
          { database, registry, resolver, ...(env.credentialsKey ? { credentialsKey: env.credentialsKey } : {}) },
          job.data.runId,
        );
      } catch (error) {
        // Perfil privado, clave no válida…: reintentar no sirve; el usuario debe actuar (mensaje en la app).
        if (isSourceError(error) && !error.retryable) throw new UnrecoverableError(error.message);
        throw error;
      } finally {
        activeSyncs.delete(job.id!);
      }
      // El proveedor aún prepara los datos (export de Google): el mismo trabajo vuelve más tarde, sin gastar reintentos.
      if (outcome.status === 'deferred') {
        const delay = outcome.retryAfterMs ?? 60_000;
        console.log(
          `[sync] ${job.data.connectionId} run ${job.data.runId}: en espera (${outcome.deferReason ?? 'proveedor'}), nueva consulta en ${Math.round(delay / 1000)} s`,
        );
        await job.moveToDelayed(Date.now() + delay, token);
        throw new DelayedError();
      }
      // La evidencia cambió: se recalculan las afinidades del usuario (agrupando syncs cercanos).
      const changed = outcome.observationsInserted + outcome.observationsUpdated + outcome.observationsDeleted > 0;
      if (changed && outcome.userId) await enqueueAffinity(producer, outcome.userId).catch(() => undefined);
      console.log(
        `[sync] ${job.data.connectionId} run ${job.data.runId}: ${outcome.status} ` +
          `(+${outcome.observationsInserted} ~${outcome.observationsUpdated} =${outcome.observationsUnchanged} -${outcome.observationsDeleted}, ` +
          `${outcome.partialErrors.length} errores parciales)`,
      );
      return { status: outcome.status };
    },
    { connection, prefix: env.queuePrefix, concurrency: 2 },
  ),
  // Afinidades direccionales (§11): de un usuario tras un cambio de evidencia, o de todo cada día.
  new Worker<AffinityJob>(
    QUEUES.affinity,
    async (job) => {
      const results = await recomputeAffinities(database.db, job.data.userId ? { userIds: [job.data.userId] } : {});
      for (const r of results) {
        console.log(
          `[afinidad] ${job.data.userId ? `usuario ${job.data.userId}` : 'recálculo completo'} (${r.dataset}): ` +
            `${r.pairsWithAffinity} parejas con afinidad de ${r.pairsCompared} comparadas, ${r.eligibleUsers} usuarios elegibles`,
        );
      }
      return { results };
    },
    { connection, prefix: env.queuePrefix, concurrency: 1 },
  ),
  // Caché de imágenes del catálogo, con ritmo limitado para no sobrecargar el origen (Wikimedia).
  new Worker<CatalogImageJob>(
    QUEUES.catalogImages,
    async (job) => ({ outcome: await cacheCatalogImage(database.db, storage, job.data.imageId) }),
    { connection, prefix: env.queuePrefix, concurrency: 2, limiter: { max: 4, duration: 1_000 } },
  ),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => console.error(`[${worker.name}] trabajo ${job?.id} falló: ${error.message}`));
}

async function beat(): Promise<void> {
  try {
    await heartbeatClient.set(workerHeartbeatKey(env.queuePrefix), String(Date.now()), 'EX', 60);
  } catch (error) {
    console.error(`No se pudo escribir el latido: ${(error as Error).message}`);
  }
}
await beat();
const heartbeat = setInterval(beat, 10_000);

// Revisión horaria de syncs pendientes (idempotente: el programador se registra con un id fijo).
const systemQueue = new Queue(QUEUES.system, { connection, prefix: env.queuePrefix });
await systemQueue.upsertJobScheduler('schedule-syncs', { every: 60 * 60 * 1000 }, { name: 'schedule-syncs', data: { requestedAt: 'scheduler' } });
// Catálogo: imágenes (y relaciones por contenido) cada 6 h; la primera ejecución, al arrancar.
await systemQueue.upsertJobScheduler('enrich-catalog', { every: 6 * 60 * 60 * 1000 }, { name: 'enrich-catalog', data: { requestedAt: 'scheduler' } });
await systemQueue.add('enrich-catalog', { requestedAt: 'startup' }, { removeOnComplete: true });
await systemQueue.upsertJobScheduler('send-digests', { every: 30 * 60 * 1000 }, { name: 'send-digests', data: { requestedAt: 'scheduler' } });
// Recálculo completo diario de afinidades (cubre cambios no ligados a un sync, como un usuario que deja de ser elegible).
const affinityQueue = new Queue<AffinityJob>(QUEUES.affinity, { connection, prefix: env.queuePrefix });
await affinityQueue.upsertJobScheduler('recompute-affinities', { every: 24 * 60 * 60 * 1000 }, { name: 'recompute-all', data: {} });

console.log(
  `Worker escuchando colas [${workers.map((w) => w.name).join(', ')}] con prefijo ${env.queuePrefix}` +
    (env.demoMode ? ' · DEMO_MODE: fuentes fixture activas' : '') +
    (env.steamApiKey ? ` · Steam activo (syncs cada ${env.syncIntervalHours} h)` : ' · Steam sin configurar (falta STEAM_WEB_API_KEY)') +
    (env.google ? ' · Google activo' : ' · Google sin configurar (falta el cliente OAuth)') +
    (env.google && !env.credentialsKey ? ' · AVISO: falta CREDENTIALS_ENCRYPTION_KEY' : ''),
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) {
    console.log(`${signal}: salida inmediata`);
    process.exit(1);
  }
  stopping = true;
  console.log(`${signal}: cerrando worker…`);
  clearInterval(heartbeat);
  // No se espera a los syncs en curso (identificar en catálogos puede llevar minutos y el proceso quedaría vivo tras
  // cerrar pnpm): se dejan de pedir trabajos y los activos vuelven a la cola; el próximo arranque los retoma (son
  // idempotentes y el bloqueo por conexión de PostgreSQL se libera al salir).
  await Promise.allSettled(workers.map((w) => w.pause(true)));
  for (const { job, token } of activeSyncs.values()) {
    await job
      .moveToWait(token)
      .then(() => console.log(`[sync] run ${job.data.runId}: devuelto a la cola, se retomará al arrancar el worker`))
      .catch((error: Error) => console.error(`[sync] run ${job.data.runId}: no se pudo devolver a la cola (${error.message})`));
  }
  await Promise.race([Promise.allSettled(workers.map((w) => w.close(true))), new Promise((r) => setTimeout(r, 5_000))]);
  await Promise.allSettled([systemQueue.close(), affinityQueue.close(), producer.close()]);
  await Promise.allSettled([connection.quit(), heartbeatClient.quit(), database.close()]);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
