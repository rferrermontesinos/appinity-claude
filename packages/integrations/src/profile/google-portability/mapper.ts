import { frequencyPreference, normalizeRating } from '@appinity/algorithms';
import type { NormalizeContext, NormalizedObservation } from '@appinity/shared';
import {
  FOOD_MIN_VISITS_FOR_PREFERENCE,
  FOOD_PREFERENCE_CONFIDENCE,
  GOOGLE_MAPPER_VERSION,
  OBSERVATION_KIND,
  STAR_SCALE,
  THUMB_CONFIDENCE,
  THUMB_CONSUMED,
  THUMB_SCORE,
  YT_MIN_PLAYS_FOR_PREFERENCE,
  YT_PREFERENCE_CONFIDENCE,
} from './constants.js';
import { googlePlaceIds } from './archive.js';
import type { GoogleRecord } from './schemas.js';

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * Registro de Google identificado → observación (`google-portability-v1`, propuesta sin calibrar):
 * - Reseña de Maps con estrellas: valoración explícita (r − 3) / 2, conocida y consumida (la visita se reseña).
 *   Sin estrellas: conocida y consumida, preferencia NULL.
 * - Sitio guardado en Maps: conocido, no consumido, preferencia NULL.
 * - Estrellas en la Búsqueda: valoración explícita; pulgar: like/dislike explícito ±0,8 (consumo 0,7: se puede valorar
 *   sin haber visto); «visto»: consumido sin preferencia.
 * - YouTube (fase 4): escuchas agregadas por artista o programa → consumido; desde 3 escuchas, preferencia inferida
 *   `min(1, log1p(n) / log1p(p95 del usuario en esa categoría))` con confianza 0,6 (conducta, no voto). Suscripción y
 *   biblioteca de YouTube Music → conocido, no consumido, preferencia NULL (§5: seguir o guardar no prueba escucha).
 * - Fase 11: biblioteca de Play → conocido (poseído), no consumido, preferencia NULL. Lugar guardado en colecciones →
 *   conocido, no consumido, NULL. Pedidos y reservas → conocido y consumido; desde 2 visitas, preferencia por frecuencia
 *   (base `attendance`, confianza 0,5).
 * La confianza de la identificación multiplica las confianzas: una identificación dudosa pesa menos y no oculta el
 * objeto en Home (umbral 0,8). Nunca se guarda el texto de las reseñas.
 */
export function mapGoogleRecord(raw: unknown, context: NormalizeContext): NormalizedObservation[] {
  const { recordId, record, identified } = raw as GoogleRecord;
  const id = identified.confidence;
  const kind = OBSERVATION_KIND[record.group];
  // El CID de Google identifica el mismo lugar entre usuarios aunque OSM no lo tenga (o cambie su elemento).
  const cid =
    record.group === 'maps.reviews' || record.group === 'maps.starred_places'
      ? googlePlaceIds(record.place.mapsUrl).cid
      : record.group === 'saved.collections'
        ? googlePlaceIds(record.mapsUrl).cid
        : undefined;
  const base = {
    userId: context.userId,
    source: 'google_portability' as const,
    sourceRecordId: recordId,
    observationKind: kind,
    mapperVersion: GOOGLE_MAPPER_VERSION,
    category: identified.category,
    externalItem: {
      sourceId: recordId,
      itemType: identified.itemType,
      title: identified.title,
      canonicalIds: { ...identified.canonicalIds, ...(cid ? { 'google_maps:cid': cid } : {}) },
      ...(identified.releaseYear || identified.location
        ? {
            attributes: {
              ...(identified.releaseYear ? { releaseYear: identified.releaseYear } : {}),
              ...(identified.location ? { location: identified.location } : {}),
            },
          }
        : {}),
    },
    ...(record.date ? { occurredAt: record.date, timestampPrecision: 'instant' as const } : {}),
    metadata: { snapshot: true, identification: { method: identified.method, confidence: identified.confidence } },
  };
  const known = round4(id);

  switch (record.group) {
    case 'maps.reviews':
    case 'search_ugc.media.reviews_and_stars': {
      const stars = record.group === 'maps.reviews' ? record.rating : record.stars;
      if (stars === null) {
        return [{ ...base, knownConfidence: known, consumedConfidence: known, preferenceScore: null, preferenceConfidence: null, preferenceBasis: null, engagement: { type: 'review' } }];
      }
      return [
        {
          ...base,
          knownConfidence: known,
          consumedConfidence: known,
          preferenceScore: normalizeRating(stars, STAR_SCALE),
          preferenceConfidence: round4(id),
          preferenceBasis: 'explicit_rating',
          engagement: { type: 'rating', value: stars, unit: 'stars_1_5' },
        },
      ];
    }
    case 'maps.starred_places':
      return [{ ...base, knownConfidence: known, consumedConfidence: 0, preferenceScore: null, preferenceConfidence: null, preferenceBasis: null, engagement: { type: 'saved' } }];
    case 'search_ugc.media.thumbs':
      return [
        {
          ...base,
          knownConfidence: known,
          consumedConfidence: round4(THUMB_CONSUMED * id),
          preferenceScore: record.thumb === 'up' ? THUMB_SCORE : -THUMB_SCORE,
          preferenceConfidence: round4(THUMB_CONFIDENCE * id),
          preferenceBasis: 'explicit_like',
          engagement: { type: 'liked', value: record.thumb === 'up' ? 1 : -1 },
        },
      ];
    case 'search_ugc.media.watched':
      return [{ ...base, knownConfidence: known, consumedConfidence: known, preferenceScore: null, preferenceConfidence: null, preferenceBasis: null, engagement: { type: 'completed' } }];
    case 'myactivity.youtube': {
      const p95 = context.stats?.[`yt_plays_p95_${identified.category}`] ?? null;
      const score = frequencyPreference(record.plays, p95, YT_MIN_PLAYS_FOR_PREFERENCE);
      return [
        {
          ...base,
          knownConfidence: known,
          consumedConfidence: known,
          preferenceScore: score,
          preferenceConfidence: score === null ? null : round4(YT_PREFERENCE_CONFIDENCE * id),
          preferenceBasis: score === null ? null : 'strong_behavior',
          engagement: { type: 'listened', value: record.plays, unit: 'plays' },
          metadata: { ...base.metadata, plays: record.plays, musicPlays: record.musicPlays, channels: record.channels },
        },
      ];
    }
    case 'youtube.subscriptions':
      return [{ ...base, knownConfidence: known, consumedConfidence: 0, preferenceScore: null, preferenceConfidence: null, preferenceBasis: null, engagement: { type: 'saved', unit: 'subscription' } }];
    case 'youtube.music':
      return [
        {
          ...base,
          knownConfidence: known,
          consumedConfidence: 0,
          preferenceScore: null,
          preferenceConfidence: null,
          preferenceBasis: null,
          engagement: { type: 'saved', value: record.songs, unit: 'library_songs' },
        },
      ];
    case 'play.library':
      return [{ ...base, knownConfidence: known, consumedConfidence: 0, preferenceScore: null, preferenceConfidence: null, preferenceBasis: null, engagement: { type: 'owned', unit: 'play_library' } }];
    case 'saved.collections':
      return [
        {
          ...base,
          knownConfidence: known,
          consumedConfidence: 0,
          preferenceScore: null,
          preferenceConfidence: null,
          preferenceBasis: null,
          engagement: { type: 'saved', value: record.lists, unit: 'collections' },
        },
      ];
    case 'order_reserve.purchases_reservations': {
      const visits = record.orders + record.reservations;
      const score = frequencyPreference(visits, context.stats?.food_visits_p95 ?? null, FOOD_MIN_VISITS_FOR_PREFERENCE);
      return [
        {
          ...base,
          knownConfidence: known,
          consumedConfidence: known,
          preferenceScore: score,
          preferenceConfidence: score === null ? null : round4(FOOD_PREFERENCE_CONFIDENCE * id),
          preferenceBasis: score === null ? null : 'attendance',
          engagement: { type: 'attendance', value: visits, unit: 'orders_and_reservations' },
          metadata: { ...base.metadata, orders: record.orders, reservations: record.reservations },
        },
      ];
    }
  }
}
