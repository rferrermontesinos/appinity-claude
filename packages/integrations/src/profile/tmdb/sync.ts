import { RATING_SCALES, normalizeRating } from '@appinity/algorithms';
import { SourceError, type SyncBatch, type SyncContext, type SyncPartialError } from '@appinity/shared';
import type { TmdbClient } from '../../tmdb/client.js';
import { TMDB_LISTS, TMDB_MAX_PAGES_PER_LIST } from './constants.js';
import { tmdbListItemSchema, type TmdbRecord } from '../../tmdb/schemas.js';

function validRating(value: number | undefined): boolean {
  if (value === undefined) return false;
  try {
    normalizeRating(value, RATING_SCALES.halfToTen);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync de TMDb: instantánea completa de las seis listas personales (valoradas, favoritas y pendientes de películas y
 * series), paginadas de 20 en 20. Solo se leen las listas de la cuenta que el usuario autorizó, con su `session_id`.
 * No hay historial de visionado en la API: no se inventa. Si una página falla, el sync entero falla (no se publica
 * una instantánea parcial que borraría evidencia).
 */
export async function syncTmdb(client: TmdbClient, context: SyncContext): Promise<SyncBatch> {
  const accountId = context.connection.externalAccountRef ?? '';
  const sessionId = context.credentials?.sessionId;
  if (!/^\d+$/.test(accountId) || !sessionId) {
    throw new SourceError('verification_failed', 'La conexión de TMDb está incompleta: vuelve a conectar TMDb', false);
  }

  const records: TmdbRecord[] = [];
  const partialErrors: SyncPartialError[] = [];
  const counts: Record<string, number> = {};
  for (const list of TMDB_LISTS) {
    let page = 1;
    let reportedPages: number;
    let count = 0;
    do {
      if (context.signal?.aborted) throw new SourceError('aborted', 'Sincronización cancelada', true);
      const data = await client.listPage(accountId, sessionId, list.path, page);
      reportedPages = data.total_pages;
      for (const raw of data.results) {
        const parsed = tmdbListItemSchema.safeParse(raw);
        const id = (raw as { id?: unknown })?.id;
        const recordId = id !== undefined ? `${list.media}:${String(id)}` : undefined;
        if (!parsed.success) {
          partialErrors.push({
            ...(recordId ? { sourceRecordId: recordId } : {}),
            code: 'invalid_record',
            message: 'Elemento de lista con formato inesperado',
          });
          continue;
        }
        if (list.kind === 'rating' && !validRating(parsed.data.rating)) {
          partialErrors.push({ sourceRecordId: `${list.media}:${parsed.data.id}`, code: 'invalid_rating', message: 'Valoración fuera de la escala 0,5–10' });
          continue;
        }
        records.push({ list: list.kind, media: list.media, item: parsed.data });
        count++;
      }
      page++;
    } while (page <= Math.min(reportedPages, TMDB_MAX_PAGES_PER_LIST));
    if (reportedPages > TMDB_MAX_PAGES_PER_LIST) {
      partialErrors.push({ code: 'truncated', message: `La lista ${list.path} supera ${TMDB_MAX_PAGES_PER_LIST} páginas; se importó parcialmente` });
    }
    counts[`${list.kind}_${list.media}`] = count;
  }

  return {
    records,
    cursor: null,
    hasMore: false,
    partialErrors,
    snapshotComplete: true,
    stats: counts,
  };
}

