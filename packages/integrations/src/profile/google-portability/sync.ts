import {
  isSourceError,
  normalizeTitle,
  SourceError,
  type EntityIdentifier,
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
  isResourceGroup,
  pollDelayMs,
  type ResourceGroup,
} from './constants.js';
import type { ExportRecord, GoogleRecord } from './schemas.js';

/** Estado del adapter guardado (cifrado) junto a las credenciales. */
export interface PortabilityState {
  groups: ResourceGroup[];
  oneTime: string[];
  jobs: Partial<Record<ResourceGroup, { id: string; initiatedAt: string; retries: number }>>;
  exportedAt: Partial<Record<ResourceGroup, string>>;
}

/** Espera ante un catálogo (OSM, Wikidata) saturado o caído. */
const IDENTIFIER_RETRY_MS = 10 * 60_000;

const GROUP_LABEL: Record<ResourceGroup, string> = {
  'maps.reviews': 'reseñas de Maps',
  'maps.starred_places': 'sitios guardados de Maps',
  'search_ugc.media.reviews_and_stars': 'valoraciones con estrellas de la Búsqueda',
  'search_ugc.media.thumbs': 'pulgares de la Búsqueda',
  'search_ugc.media.watched': 'películas y series vistas',
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

/** Identificador estable del registro (no depende de la identificación, que puede mejorar con el tiempo). */
export function recordIdOf(record: ExportRecord): string {
  if (record.group === 'maps.reviews' || record.group === 'maps.starred_places') {
    const { cid, placeId } = googlePlaceIds(record.place.mapsUrl);
    if (cid) return `place:cid:${cid}`;
    if (placeId) return `place:pid:${placeId}`;
    return `place:${record.place.latitude.toFixed(5)},${record.place.longitude.toFixed(5)}:${normalizeTitle(record.place.name)}`;
  }
  return `work:${normalizeTitle(record.query)}`;
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
  if (!credentials?.refreshToken) {
    throw new SourceError('verification_failed', 'La conexión con Google está incompleta: vuelve a autorizarla', false);
  }
  const state = readState(credentials);
  const persist = async () => context.saveState?.(writeState(state));
  const accessToken = await client.refresh(credentials.refreshToken);
  const now = context.now;
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
    const { records: exported, summary } = readArchive(group, zips);
    options.onArchiveSummary?.(summary);
    const mappable = exported.filter(isMappable);
    const invalid = summary.skipped + exported.length - mappable.length;
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
    const outcome = summarizeIdentification(identified);
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
export function summarizeIdentification(results: PlaceIdentification[]) {
  const scopes = new Map<string, number>();
  let identified = 0;
  let noMatch = 0;
  let ambiguous = 0;
  for (const result of results) {
    if (result.entity) identified++;
    else if (result.reason === 'out_of_scope') scopes.set(result.scope, (scopes.get(result.scope) ?? 0) + 1);
    else if (result.reason === 'ambiguous') ambiguous++;
    else noMatch++;
  }
  const outOfScope = [...scopes.values()].reduce((a, b) => a + b, 0);
  const ranked = [...scopes].sort((a, b) => b[1] - a[1]);
  const parts = [
    ...(outOfScope ? [`${outOfScope} son de lugares fuera de las categorías de APPINITY (${ranked.slice(0, 3).map(([s]) => s).join(', ')}${ranked.length > 3 ? '…' : ''})`] : []),
    ...(noMatch + ambiguous ? [`${noMatch + ambiguous} no se pudieron identificar con seguridad`] : []),
  ];
  const detail = [
    ...(outOfScope ? [`fuera de categoría ${outOfScope} (${ranked.map(([s, n]) => `${s} ${n}`).join(', ')})`] : []),
    ...(noMatch ? [`sin coincidencia en el catálogo ${noMatch}`] : []),
    ...(ambiguous ? [`ambiguos ${ambiguous}`] : []),
  ];
  return { identified, outOfScope, noMatch, ambiguous, message: parts.join(' y '), detail: detail.length ? ` · ${detail.join(' · ')}` : '' };
}

/** Identifica los registros de un grupo: lugares en bloque (OSM agrupa las consultas) y obras una a una (Wikidata). */
async function identifyAll(group: ResourceGroup, records: ExportRecord[], options: PortabilitySyncOptions): Promise<PlaceIdentification[]> {
  const progress = options.onProgress;
  if (!records.length) return [];
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

/** Registros con la información mínima para crear evidencia. */
function isMappable(record: ExportRecord): boolean {
  switch (record.group) {
    case 'search_ugc.media.thumbs':
      return record.thumb !== null;
    default:
      return true;
  }
}
