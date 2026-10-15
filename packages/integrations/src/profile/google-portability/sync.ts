import { percentile } from '@appinity/algorithms';
import {
  isSourceError,
  normalizeTitle,
  SourceError,
  type EntityIdentifier,
  type Identification,
  type PlaceIdentification,
  type SyncBatch,
  type SyncContext,
  type SyncPartialError,
} from '@appinity/shared';
import { googlePlaceIds, readArchive, type ArchiveSummary } from './archive.js';
import { ExportLimitError, type GooglePortabilityClient } from './client.js';
import {
  EXPORT_MAX_RETRIES,
  EXPORT_MAX_WAIT_MS,
  EXPORT_MIN_INTERVAL_MS,
  OBSERVATION_KIND,
  PLAY_MAX_ITEMS,
  TEXT_PLACES_MAX,
  isResourceGroup,
  pollDelayMs,
  type ResourceGroup,
} from './constants.js';
import type { ExportRecord, GoogleRecord } from './schemas.js';
import { processYouTube } from './youtube.js';

/** Estado del adapter guardado (cifrado) junto a las credenciales. */
export interface PortabilityState {
  groups: ResourceGroup[];
  oneTime: string[];
  jobs: Partial<Record<ResourceGroup, { id: string; initiatedAt: string; retries: number }>>;
  exportedAt: Partial<Record<ResourceGroup, string>>;
}

/** Motivos de descarte que no son errores: lo que el usuario canceló, aún no ocurrió o APPINITY no usa. */
const DELIBERATE_SKIPS = new Set(['tipo_no_usado', 'pedido_cancelado', 'reserva_cancelada', 'reserva_futura', 'no_es_lugar']);

/** Espera ante un catálogo (OSM, Wikidata) saturado o caído. */
const IDENTIFIER_RETRY_MS = 10 * 60_000;

const GROUP_LABEL: Record<ResourceGroup, string> = {
  'maps.reviews': 'reseñas de Maps',
  'maps.starred_places': 'sitios guardados de Maps',
  'search_ugc.media.reviews_and_stars': 'valoraciones con estrellas de la Búsqueda',
  'search_ugc.media.thumbs': 'pulgares de la Búsqueda',
  'search_ugc.media.watched': 'películas y series vistas',
  'myactivity.youtube': 'canales vistos o escuchados en YouTube',
  'youtube.music': 'artistas de la biblioteca de YouTube Music',
  'youtube.subscriptions': 'suscripciones de YouTube',
  'play.library': 'objetos de la biblioteca de Google Play',
  'order_reserve.purchases_reservations': 'restaurantes de pedidos y reservas',
  'saved.collections': 'lugares guardados en colecciones',
};

function json<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function readState(credentials: Record<string, string>): PortabilityState {
  return {
    groups: json<string[]>(credentials.groups, []).filter(isResourceGroup),
    oneTime: json<string[]>(credentials.oneTime, []),
    jobs: json(credentials.jobs, {}),
    exportedAt: json(credentials.exportedAt, {}),
  };
}

const writeState = (state: PortabilityState) => ({
  jobs: JSON.stringify(state.jobs),
  exportedAt: JSON.stringify(state.exportedAt),
});

/**
 * Token de acceso vigente: con refresh token se pide uno nuevo; si Google no lo entregó, el access token guardado
 * mientras le quede al menos un minuto. Null si no hay forma de acceder.
 */
export async function accessTokenFor(client: GooglePortabilityClient, credentials: Record<string, string>, now: Date): Promise<string | null> {
  if (credentials.refreshToken) return client.refresh(credentials.refreshToken);
  const expires = Date.parse(credentials.accessTokenExpiresAt ?? '');
  return credentials.accessToken && expires - now.getTime() > 60_000 ? credentials.accessToken : null;
}

/** Identificador estable del registro (no depende de la identificación, que puede mejorar con el tiempo). */
export function recordIdOf(record: ExportRecord): string {
  if (record.group === 'maps.reviews' || record.group === 'maps.starred_places') {
    const { cid, placeId } = googlePlaceIds(record.place.mapsUrl);
    if (cid) return `place:cid:${cid}`;
    if (placeId) return `place:pid:${placeId}`;
    return `place:${record.place.latitude.toFixed(5)},${record.place.longitude.toFixed(5)}:${normalizeTitle(record.place.name)}`;
  }
  if (record.group === 'play.library') return `play:${record.docType}:${record.packageName ?? normalizeTitle(record.title)}`;
  if (record.group === 'saved.collections') {
    const { cid, placeId } = googlePlaceIds(record.mapsUrl);
    if (cid) return `place:cid:${cid}`;
    if (placeId) return `place:pid:${placeId}`;
  }
  if (record.group === 'saved.collections' || record.group === 'order_reserve.purchases_reservations') {
    return `venue:${normalizeTitle(record.venue.name)}|${normalizeTitle(record.venue.address ?? '')}`;
  }
  // Los registros de YouTube llegan ya agregados con su id (youtube.ts); este caso no se da.
  return 'query' in record ? `work:${normalizeTitle(record.query)}` : `${record.group}:sin-id`;
}

export interface PortabilitySyncOptions {
  identifier: EntityIdentifier;
  onArchiveSummary?: (summary: ArchiveSummary) => void;
  /** Progreso de la identificación (sin datos personales: grupo y recuentos). */
  onProgress?: (message: string) => void;
}

/**
 * Sync de Google Data Portability. Un export por grupo autorizado:
 * 1. Si no hay export en curso y toca (acceso temporal: cada 24 h; acceso único: solo una vez), se inicia y su id se
 *    guarda cifrado ANTES de esperar (un acceso único no se puede repetir).
 * 2. Mientras Google lo prepara, el sync se aplaza (`pending`) sin escribir nada.
 * 3. Completos todos, se descargan, se leen y cada registro se identifica en el catálogo (OSM para lugares, Wikidata
 *    para obras). Lo que no se identifica con seguridad no se importa y se informa sin bloquear la instantánea.
 */
export async function syncPortability(
  client: GooglePortabilityClient,
  context: SyncContext,
  options: PortabilitySyncOptions,
): Promise<SyncBatch> {
  const credentials = context.credentials;
  const now = context.now;
  const accessToken = credentials ? await accessTokenFor(client, credentials, now) : null;
  if (!credentials || !accessToken) {
    throw new SourceError(
      'verification_failed',
      credentials?.accessToken
        ? 'El acceso de Google (sin renovación automática) ha caducado: renueva el permiso para volver a importar'
        : 'La conexión con Google está incompleta: vuelve a autorizarla',
      false,
    );
  }
  options.onProgress?.(credentials.refreshToken ? 'acceso con renovación automática' : `acceso sin renovación hasta ${credentials.accessTokenExpiresAt}`);
  const state = readState(credentials);
  const persist = async () => context.saveState?.(writeState(state));
  const partialErrors: SyncPartialError[] = [];
  const completed = new Map<ResourceGroup, string[]>();
  let retryAfterMs: number | null = null;

  for (const group of state.groups) {
    let job = state.jobs[group];
    if (!job) {
      const last = state.exportedAt[group];
      const oneTime = state.oneTime.includes(group);
      if (last && (oneTime || now.getTime() - Date.parse(last) < EXPORT_MIN_INTERVAL_MS)) continue;
      try {
        const started = await client.initiate(accessToken, group);
        job = { id: started.jobId, initiatedAt: now.toISOString(), retries: 0 };
        state.jobs[group] = job;
        await persist();
      } catch (error) {
        if (!(error instanceof ExportLimitError)) throw error;
        if (error.kind === 'unsupported') {
          partialErrors.push({
            code: 'export_unsupported',
            message: `Google no permite exportar ${GROUP_LABEL[group]} para esta cuenta, aunque se concedió el permiso; el resto se importa con normalidad`,
            blocking: false,
          });
          continue;
        }
        if (error.kind === 'already_exists') {
          if (error.existingJobId) {
            state.jobs[group] = { id: error.existingJobId, initiatedAt: now.toISOString(), retries: 0 };
            await persist();
            // Se consultará su estado en la siguiente pasada, como cualquier export recién pedido.
            retryAfterMs = Math.min(retryAfterMs ?? Infinity, 60_000);
          } else {
            partialErrors.push({
              code: 'export_in_progress',
              message: `Google ya está preparando un export de ${GROUP_LABEL[group]} pedido en un intento anterior; se volverá a pedir en el próximo sync (${error.message})`,
              blocking: false,
            });
            continue;
          }
        }
        if (error.kind === 'one_time') {
          state.exportedAt[group] ??= now.toISOString();
          await persist();
          partialErrors.push({
            code: 'one_time_used',
            message: `Acceso único ya usado (${GROUP_LABEL[group]}): renueva el permiso de Google eligiendo 30 o 180 días`,
            blocking: false,
          });
        }
        continue;
      }
    }

    const archive = await client.state(accessToken, job.id);
    if (archive.state === 'COMPLETE') {
      completed.set(group, archive.urls ?? []);
      continue;
    }
    if (archive.state === 'FAILED' || archive.state === 'CANCELLED') {
      if (job.retries < EXPORT_MAX_RETRIES) {
        state.jobs[group] = { id: await client.retry(accessToken, job.id), initiatedAt: job.initiatedAt, retries: job.retries + 1 };
        await persist();
        retryAfterMs = Math.min(retryAfterMs ?? Infinity, 60_000);
      } else {
        delete state.jobs[group];
        await persist();
        partialErrors.push({ code: 'export_failed', message: `Google no pudo preparar el export de ${GROUP_LABEL[group]}` });
      }
      continue;
    }
    const elapsed = now.getTime() - Date.parse(job.initiatedAt);
    if (elapsed > EXPORT_MAX_WAIT_MS) {
      delete state.jobs[group];
      await persist();
      partialErrors.push({ code: 'export_timeout', message: `Google no terminó el export de ${GROUP_LABEL[group]} en 7 días` });
      continue;
    }
    retryAfterMs = Math.min(retryAfterMs ?? Infinity, pollDelayMs(elapsed));
  }

  if (retryAfterMs !== null) {
    return {
      records: [],
      cursor: null,
      hasMore: false,
      partialErrors: [],
      snapshotComplete: false,
      pending: { retryAfterMs, reason: 'Google está preparando la exportación' },
    };
  }

  const records: GoogleRecord[] = [];
  const stats: Record<string, number> = {};
  for (const [group, urls] of completed) {
    const zips: Uint8Array[] = [];
    for (const url of urls) zips.push(await client.download(url));
    const { records: exported, summary, youtube } = readArchive(group, zips);
    options.onArchiveSummary?.(summary);
    if (youtube) {
      // YouTube: se agregan escuchas por canal, se identifican los canales y se fusionan por artista o programa.
      let result;
      try {
        result = await processYouTube(youtube, options.identifier, options.onProgress);
      } catch (error) {
        if (isSourceError(error) && error.retryable) {
          return {
            records: [],
            cursor: null,
            hasMore: false,
            partialErrors: [],
            snapshotComplete: false,
            pending: { retryAfterMs: IDENTIFIER_RETRY_MS, reason: `${error.message} (identificación de catálogo)` },
          };
        }
        throw error;
      }
      records.push(...result.records);
      Object.assign(stats, result.stats);
      const outcome = summarizeIdentification(result.identifications, group === 'youtube.music' ? 'son artistas' : 'son canales');
      options.onProgress?.(
        `${group}: ${result.records.length} artistas o programas de ${outcome.identified} de ${result.total} identificados${outcome.detail}` +
          (result.beyondLimit ? ` · sin consultar (los menos escuchados) ${result.beyondLimit}` : ''),
      );
      const kind = OBSERVATION_KIND[group];
      stats[`${kind}_exported`] = result.total;
      stats[`${kind}_identified`] = outcome.identified;
      stats[`${kind}_out_of_scope`] = outcome.outOfScope;
      const notImported = result.total - outcome.identified;
      if (notImported) {
        const parts = [outcome.message, ...(result.beyondLimit ? [`${result.beyondLimit} con menos escuchas no se consultaron`] : [])].filter(Boolean);
        partialErrors.push({
          code: 'unidentified',
          message: `${notImported} de ${result.total} ${GROUP_LABEL[group]} no se importan: ${parts.join(' y ')}`,
          blocking: false,
        });
      }
      if (summary.skipped && group !== 'myactivity.youtube') {
        partialErrors.push({ code: 'invalid_record', message: `${summary.skipped} ${GROUP_LABEL[group]} con datos incompletos`, blocking: false });
      }
      state.exportedAt[group] = now.toISOString();
      delete state.jobs[group];
      continue;
    }
    const mappable = exported.filter(isMappable);
    // Los descartes deliberados (cancelado, futuro, no es un lugar, tipo que no se usa) no son datos incompletos.
    const ignored = Object.entries(summary.skippedReasons).reduce((n, [reason, count]) => n + (DELIBERATE_SKIPS.has(reason) ? count : 0), 0);
    const invalid = summary.skipped - ignored + exported.length - mappable.length;
    let identified: PlaceIdentification[];
    try {
      identified = await identifyAll(group, mappable, options);
    } catch (error) {
      // OSM o Wikidata saturados: no se pierde nada (los exports siguen guardados 14 días y lo ya identificado queda en
      // la caché del worker); el sync se aplaza en vez de fallar.
      if (isSourceError(error) && error.retryable) {
        return {
          records: [],
          cursor: null,
          hasMore: false,
          partialErrors: [],
          snapshotComplete: false,
          pending: { retryAfterMs: IDENTIFIER_RETRY_MS, reason: `${error.message} (identificación de catálogo)` },
        };
      }
      throw error;
    }
    mappable.forEach((record, i) => {
      const entity = identified[i]!.entity;
      if (entity) records.push({ recordId: recordIdOf(record), record, identified: entity });
    });
    if (group === 'order_reserve.purchases_reservations') {
      // Referencia personal para la preferencia por frecuencia (como las escuchas de YouTube).
      const visits = records.flatMap((r) => (r.record.group === group ? [r.record.orders + r.record.reservations] : []));
      const p95 = percentile(visits, 0.95);
      if (p95 !== null) stats.food_visits_p95 = p95;
    }
    const outcome = summarizeIdentification(identified, group === 'play.library' ? 'son apps que no son videojuegos' : undefined);
    options.onProgress?.(`${group}: ${outcome.identified} de ${mappable.length} identificados${outcome.detail}`);
    const kind = OBSERVATION_KIND[group];
    stats[`${kind}_exported`] = exported.length;
    stats[`${kind}_unidentified`] = outcome.noMatch + outcome.ambiguous;
    stats[`${kind}_out_of_scope`] = outcome.outOfScope;
    const notImported = mappable.length - outcome.identified;
    if (notImported) {
      partialErrors.push({
        code: 'unidentified',
        message: `${notImported} de ${exported.length} ${GROUP_LABEL[group]} no se importan: ${outcome.message}`,
        blocking: false,
      });
    }
    if (invalid) {
      partialErrors.push({ code: 'invalid_record', message: `${invalid} ${GROUP_LABEL[group]} con datos incompletos`, blocking: false });
    }
    state.exportedAt[group] = now.toISOString();
    delete state.jobs[group];
  }
  if (completed.size) await persist();

  // Un mismo registro (grupo + id) puede aparecer dos veces: se conserva el más reciente.
  const latest = new Map<string, GoogleRecord>();
  for (const r of records) {
    const key = `${r.record.group}\u0000${r.recordId}`;
    const previous = latest.get(key);
    if (!previous || (r.record.date ?? '') >= (previous.record.date ?? '')) latest.set(key, r);
  }

  return {
    records: [...latest.values()],
    cursor: null,
    hasMore: false,
    partialErrors,
    snapshotComplete: completed.size > 0,
    snapshotKinds: [...completed.keys()].map((g) => OBSERVATION_KIND[g]),
    stats,
  };
}

type PlaceRecord = Extract<ExportRecord, { place: unknown }>;
const isPlaceRecord = (record: ExportRecord): record is PlaceRecord => 'place' in record;

/**
 * Recuento de la identificación de un grupo, sin nombres: para el aviso al usuario (lo que APPINITY no usa frente a lo
 * que no se pudo identificar) y para el log del worker (desglose por tipo de lugar).
 */
export function summarizeIdentification(results: Array<PlaceIdentification | Identification>, subject = 'son de lugares') {
  const scopes = new Map<string, number>();
  let identified = 0;
  let noMatch = 0;
  let ambiguous = 0;
  const nearby = { none: 0, other: 0, app_category: 0 };
  let triedName = 0;
  for (const result of results) {
    if (result.entity) identified++;
    else if (result.reason === 'out_of_scope') scopes.set(result.scope, (scopes.get(result.scope) ?? 0) + 1);
    else if (result.reason === 'ambiguous') ambiguous++;
    else {
      noMatch++;
      if ('nearby' in result && result.nearby) nearby[result.nearby]++;
      if ('triedName' in result && result.triedName) triedName++;
    }
  }
  const outOfScope = [...scopes.values()].reduce((a, b) => a + b, 0);
  const ranked = [...scopes].sort((a, b) => b[1] - a[1]);
  const parts = [
    ...(outOfScope ? [`${outOfScope} ${subject} fuera de las categorías de APPINITY (${ranked.slice(0, 3).map(([s]) => s).join(', ')}${ranked.length > 3 ? '…' : ''})`] : []),
    ...(noMatch + ambiguous ? [`${noMatch + ambiguous} no se pudieron identificar con seguridad`] : []),
  ];
  const detail = [
    ...(outOfScope ? [`fuera de categoría ${outOfScope} (${ranked.map(([s, n]) => `${s} ${n}`).join(', ')})`] : []),
    ...(noMatch
      ? [
          `sin coincidencia en el catálogo ${noMatch}` +
            (nearby.none + nearby.other + nearby.app_category
              ? ` (sin lugares cerca ${nearby.none}, solo otros lugares ${nearby.other}, restaurante o lugar cultural a ≤ 30 m con otro nombre ${nearby.app_category})`
              : '') +
            (triedName ? ` (buscados también como artista por nombre ${triedName})` : ''),
        ]
      : []),
    ...(ambiguous ? [`ambiguos ${ambiguous}`] : []),
  ];
  return { identified, outOfScope, noMatch, ambiguous, message: parts.join(' y '), detail: detail.length ? ` · ${detail.join(' · ')}` : '' };
}

/** Identifica los registros de un grupo: lugares en bloque (OSM agrupa las consultas) y obras una a una (Wikidata). */
async function identifyAll(group: ResourceGroup, records: ExportRecord[], options: PortabilitySyncOptions): Promise<PlaceIdentification[]> {
  const progress = options.onProgress;
  if (!records.length) return [];
  if (group === 'play.library') return identifyPlay(records as PlayRecord[], options);
  if (group === 'order_reserve.purchases_reservations' || group === 'saved.collections') return identifyVenues(group, records as VenueRecord[], options);
  const places = records.filter(isPlaceRecord);
  if (places.length === records.length) {
    progress?.(`${group}: identificando ${places.length} lugares con OpenStreetMap`);
    return options.identifier.identifyPlaces(
      places.map(({ place }) => ({
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        ...(place.countryCode ? { countryCode: place.countryCode } : {}),
      })),
      (done, total) => progress?.(`${group}: ${done}/${total} lugares consultados`),
    );
  }
  progress?.(`${group}: identificando ${records.length} títulos con Wikidata`);
  const results: PlaceIdentification[] = [];
  for (const record of records) {
    const entity = 'query' in record ? await options.identifier.identifyWork({ title: record.query, languages: ['es', 'en'] }) : null;
    results.push(entity ? { entity } : { entity: null, reason: 'no_match' });
    if (results.length % 25 === 0 && results.length < records.length) progress?.(`${group}: ${results.length}/${records.length} títulos consultados`);
  }
  return results;
}

type PlayRecord = Extract<ExportRecord, { group: 'play.library' }>;
type VenueRecord = Extract<ExportRecord, { venue: unknown }>;

const PLAY_CATEGORIES = { book: ['books'], movie: ['movies'], series: ['series'], app: ['games'] } as const;

/**
 * Biblioteca de Play: apps con ID de paquete por su ID exacto en Wikidata (solo videojuegos); el resto por título
 * exacto limitado a su categoría (un libro solo puede ser un libro). Una app sin ID cuyo título no es un videojuego
 * del catálogo queda fuera de las categorías de APPINITY (WhatsApp, Gmail…). Como mucho PLAY_MAX_ITEMS, los más recientes.
 */
async function identifyPlay(records: PlayRecord[], options: PortabilitySyncOptions): Promise<PlaceIdentification[]> {
  const progress = options.onProgress;
  const order = records.map((r, i) => ({ r, i })).sort((a, b) => (b.r.date ?? '').localeCompare(a.r.date ?? ''));
  const chosen = new Set(order.slice(0, PLAY_MAX_ITEMS).map((o) => o.i));
  const results: PlaceIdentification[] = records.map(() => ({ entity: null, reason: 'no_match' }));
  const withPackage = records.map((r, i) => ({ r, i })).filter(({ r, i }) => chosen.has(i) && r.docType === 'app' && r.packageName);
  if (withPackage.length) {
    progress?.(`play.library: identificando ${withPackage.length} apps por su ID de Google Play`);
    const found = await options.identifier.identifyApps(withPackage.map(({ r }) => r.packageName!));
    withPackage.forEach(({ i }, k) => (results[i] = found[k]!));
  }
  const byTitle = records.map((r, i) => ({ r, i })).filter(({ r, i }) => chosen.has(i) && !(r.docType === 'app' && r.packageName));
  if (byTitle.length) progress?.(`play.library: identificando ${byTitle.length} títulos con Wikidata`);
  for (const [k, { r, i }] of byTitle.entries()) {
    const entity = await options.identifier.identifyWork({ title: r.title, languages: ['es', 'en'], categories: [...PLAY_CATEGORIES[r.docType]] });
    results[i] = entity ? { entity } : r.docType === 'app' ? { entity: null, reason: 'out_of_scope', scope: 'app' } : { entity: null, reason: 'no_match' };
    if ((k + 1) % 25 === 0 && k + 1 < byTitle.length) progress?.(`play.library: ${k + 1}/${byTitle.length} títulos consultados`);
  }
  if (records.length > PLAY_MAX_ITEMS) progress?.(`play.library: ${records.length - PLAY_MAX_ITEMS} objetos más antiguos sin consultar (tope por sync)`);
  return results;
}

/**
 * Pedidos, reservas y guardados: los que traen coordenadas (enlace de Maps con `@lat,lng`) van directos a OSM; el
 * resto se geocodifica por nombre y dirección (como mucho TEXT_PLACES_MAX por sync, por la política de Nominatim).
 */
async function identifyVenues(group: ResourceGroup, records: VenueRecord[], options: PortabilitySyncOptions): Promise<PlaceIdentification[]> {
  const progress = options.onProgress;
  const results: PlaceIdentification[] = records.map(() => ({ entity: null, reason: 'no_match' }));
  const located = records.map((r, i) => ({ r, i })).filter(({ r }) => r.venue.latitude !== undefined && r.venue.longitude !== undefined);
  if (located.length) {
    progress?.(`${group}: identificando ${located.length} lugares con coordenadas en OpenStreetMap`);
    const found = await options.identifier.identifyPlaces(
      located.map(({ r }) => ({ name: r.venue.name, latitude: r.venue.latitude!, longitude: r.venue.longitude! })),
    );
    located.forEach(({ i }, k) => (results[i] = found[k]!));
  }
  const textual = records.map((r, i) => ({ r, i })).filter(({ r }) => r.venue.latitude === undefined || r.venue.longitude === undefined);
  const capped = textual.slice(0, TEXT_PLACES_MAX);
  if (capped.length) {
    progress?.(`${group}: localizando ${capped.length} lugares por nombre y dirección (Nominatim) e identificándolos en OpenStreetMap`);
    const found = await options.identifier.identifyPlacesByText(
      capped.map(({ r }) => ({ name: r.venue.name, ...(r.venue.address ? { address: r.venue.address } : {}) })),
      (done, total) => progress?.(`${group}: ${done}/${total} lugares localizados`),
    );
    capped.forEach(({ i }, k) => (results[i] = found[k]!));
  }
  if (textual.length > capped.length) progress?.(`${group}: ${textual.length - capped.length} lugares sin localizar (tope por sync)`);
  return results;
}

/** Registros con la información mínima para crear evidencia. */
function isMappable(record: ExportRecord): boolean {
  switch (record.group) {
    case 'search_ugc.media.thumbs':
      return record.thumb !== null;
    default:
      return true;
  }
}
