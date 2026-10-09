import { normalizeTitle, SourceError, type EntityIdentifier, type SyncBatch, type SyncContext, type SyncPartialError } from '@appinity/shared';
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
    let unidentified = 0;
    let invalid = summary.skipped;
    for (const record of exported) {
      if (!isMappable(record)) {
        invalid++;
        continue;
      }
      const identified =
        record.group === 'maps.reviews' || record.group === 'maps.starred_places'
          ? await options.identifier.identifyPlace({
              name: record.place.name,
              latitude: record.place.latitude,
              longitude: record.place.longitude,
              ...(record.place.countryCode ? { countryCode: record.place.countryCode } : {}),
            })
          : await options.identifier.identifyWork({ title: record.query, languages: ['es', 'en'] });
      if (!identified) {
        unidentified++;
        continue;
      }
      records.push({ recordId: recordIdOf(record), record, identified });
    }
    stats[`${OBSERVATION_KIND[group]}_exported`] = exported.length;
    stats[`${OBSERVATION_KIND[group]}_unidentified`] = unidentified;
    if (unidentified) {
      partialErrors.push({
        code: 'unidentified',
        message: `${unidentified} de ${exported.length} ${GROUP_LABEL[group]} no se pudieron identificar con seguridad y no se importan`,
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

/** Registros con la información mínima para crear evidencia. */
function isMappable(record: ExportRecord): boolean {
  switch (record.group) {
    case 'search_ugc.media.thumbs':
      return record.thumb !== null;
    default:
      return true;
  }
}
