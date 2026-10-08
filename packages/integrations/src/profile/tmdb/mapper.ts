import { RATING_SCALES, normalizeRating } from '@appinity/algorithms';
import type { NormalizeContext, NormalizedObservation } from '@appinity/shared';
import { TMDB_IMAGE_BASE, TMDB_TERMS_URL } from '../../tmdb/constants.js';
import { tmdbRecordSchema, type TmdbListItem } from '../../tmdb/schemas.js';
import { TMDB_FAVORITE_CONFIDENCE, TMDB_FAVORITE_SCORE, TMDB_MAPPER_VERSION, TMDB_RATING_CONFIDENCE } from './constants.js';

function releaseYear(item: TmdbListItem): number | undefined {
  const date = item.release_date || item.first_air_date;
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isInteger(year) && year >= 1000 && year <= 3000 ? year : undefined;
}

/**
 * Elemento de una lista personal de TMDb → observación (§5 y §9). Cada lista es una observación distinta del mismo
 * objeto (`movie:603` puede estar valorada y en favoritos a la vez), y la consolidación decide por prioridad de base:
 * - Valorada: conocida 1, consumida 1 (solo se valora lo visto), preferencia explícita normalizada en 0,5–10.
 * - Favorita: conocida 1, consumida 0 (marcar favorito no prueba haberla visto), like explícito +0,8.
 * - Pendiente (watchlist): conocida 1, consumida 0, preferencia NULL (querer verla no es gustar).
 * TMDb no expone fechas para estas listas: no se inventa `occurredAt`. Películas y series nunca comparten ID:
 * `tmdb:movie:603` y `tmdb:tv:603` son objetos distintos.
 */
export function mapTmdbRecord(raw: unknown, context: NormalizeContext): NormalizedObservation[] {
  const { list, media, item } = tmdbRecordSchema.parse(raw);
  const recordId = `${media}:${item.id}`;
  const title = (media === 'movie' ? item.title ?? item.original_title : item.name ?? item.original_name) ?? `TMDb ${recordId}`;
  const year = releaseYear(item);

  const base = {
    userId: context.userId,
    source: 'tmdb' as const,
    sourceRecordId: recordId,
    mapperVersion: TMDB_MAPPER_VERSION,
    category: media === 'movie' ? ('movies' as const) : ('series' as const),
    externalItem: {
      sourceId: recordId,
      itemType: media === 'movie' ? 'movie' : 'series',
      title,
      canonicalIds: { [media === 'movie' ? 'tmdb:movie' : 'tmdb:tv']: String(item.id) },
      ...(year ? { attributes: { releaseYear: year } } : {}),
      // Solo referencia al CDN de TMDb, con atribución: no se copia el póster a nuestro almacenamiento.
      ...(item.poster_path
        ? {
            imageCandidate: {
              url: `${TMDB_IMAGE_BASE}${item.poster_path}`,
              source: 'tmdb',
              sourceImageId: `poster:${item.poster_path}`,
              alt: title,
              rightsOrPolicyReference: TMDB_TERMS_URL,
              isFallback: false,
            },
          }
        : {}),
    },
    knownConfidence: 1,
  };

  if (list === 'rating') {
    if (item.rating === undefined) return [];
    const score = normalizeRating(item.rating, RATING_SCALES.halfToTen);
    return [
      {
        ...base,
        observationKind: 'rating',
        consumedConfidence: 1,
        preferenceScore: score,
        preferenceConfidence: TMDB_RATING_CONFIDENCE,
        preferenceBasis: 'explicit_rating',
        engagement: { type: 'rating', value: item.rating, unit: 'tmdb_0.5-10' },
        metadata: { snapshot: true },
      },
    ];
  }
  if (list === 'favorite') {
    return [
      {
        ...base,
        observationKind: 'favorite',
        consumedConfidence: 0,
        preferenceScore: TMDB_FAVORITE_SCORE,
        preferenceConfidence: TMDB_FAVORITE_CONFIDENCE,
        preferenceBasis: 'explicit_like',
        engagement: { type: 'liked' },
        metadata: { snapshot: true },
      },
    ];
  }
  return [
    {
      ...base,
      observationKind: 'watchlist',
      consumedConfidence: 0,
      preferenceScore: null,
      preferenceConfidence: null,
      preferenceBasis: null,
      engagement: { type: 'saved' },
      metadata: { snapshot: true },
    },
  ];
}
