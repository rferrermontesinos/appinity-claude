import { RATING_SCALES, frequencyPreference, normalizeRating, playtimePreference } from '@appinity/algorithms';
import type {
  Category,
  FixtureSourceKey,
  NormalizeContext,
  NormalizedObservation,
  PreferenceBasis,
  TimestampPrecision,
} from '@appinity/shared';
import {
  ATTENDANCE_CONFIDENCE,
  AUDIO_MIN_PLAYS_FOR_PREFERENCE,
  AUDIO_PREFERENCE_CONFIDENCE,
  EXPLICIT_RATING_CONFIDENCE,
  FIXTURE_MAPPER_VERSIONS,
  LOVED_TRACK_CONFIDENCE,
  LOVED_TRACK_SCORE,
  PLANNED_EVENT_KNOWN,
  PLAY_MIN_HOURS_FOR_PREFERENCE,
  PLAY_PREFERENCE_CONFIDENCE,
  PODCAST_MIN_EPISODES_FOR_PREFERENCE,
  PODCAST_PREFERENCE_CONFIDENCE,
  THUMBS_CONFIDENCE,
  THUMBS_SCORE,
  VISIT_CONFIDENCE,
} from './constants.js';
import {
  activityRecordSchema,
  audioRecordSchema,
  diaryRecordSchema,
  playRecordSchema,
  screenRecordSchema,
} from './schemas.js';

type Item = NormalizedObservation['externalItem'];

interface Dimensions {
  known: number;
  consumed: number;
  preference?: { score: number; confidence: number; basis: PreferenceBasis } | null;
}

function observation(
  ctx: NormalizeContext,
  source: FixtureSourceKey,
  sourceRecordId: string,
  observationKind: string,
  category: Category,
  externalItem: Item,
  dims: Dimensions,
  extra: Pick<NormalizedObservation, 'engagement' | 'metadata'> & { time?: { at: string; precision: TimestampPrecision } | null },
): NormalizedObservation {
  return {
    userId: ctx.userId,
    source,
    sourceRecordId,
    observationKind,
    mapperVersion: FIXTURE_MAPPER_VERSIONS[source],
    category,
    externalItem,
    ...(extra.time ? { occurredAt: extra.time.at, timestampPrecision: extra.time.precision } : {}),
    knownConfidence: dims.known,
    consumedConfidence: dims.consumed,
    preferenceScore: dims.preference?.score ?? null,
    preferenceConfidence: dims.preference?.confidence ?? null,
    preferenceBasis: dims.preference?.basis ?? null,
    ...(extra.engagement ? { engagement: extra.engagement } : {}),
    metadata: { simulated: true, ...(extra.metadata ?? {}) },
  };
}

const instant = (at: string | null | undefined) => (at ? { at, precision: 'instant' as const } : null);

/** "2025-11-02" → precisión de día; "2019" → precisión de año. No se inventa el día. */
export function partialDate(value: string | null): { at: string; precision: TimestampPrecision } | null {
  if (!value) return null;
  if (/^\d{4}$/.test(value)) return { at: `${value}-01-01T00:00:00.000Z`, precision: 'year' };
  return { at: `${value}T00:00:00.000Z`, precision: 'day' };
}

/** Cine y series (clase TMDb): watchlist ⇒ conocido; visto ⇒ consumido; valoración 1–10 ⇒ preferencia. */
export function mapScreenRecord(raw: unknown, ctx: NormalizeContext): NormalizedObservation[] {
  const r = screenRecordSchema.parse(raw);
  const movie = r.media.kind === 'movie';
  const category: Category = movie ? 'movies' : 'series';
  const recordId = `${r.media.kind}:${r.media.tmdbId}`;
  const item: Item = {
    sourceId: recordId,
    itemType: movie ? 'movie' : 'series',
    title: r.media.title,
    canonicalIds: {
      [movie ? 'tmdb:movie' : 'tmdb:tv']: String(r.media.tmdbId),
      ...(r.media.imdbId ? { 'imdb:title': r.media.imdbId } : {}),
    },
    ...(r.media.year ? { attributes: { releaseYear: r.media.year } } : {}),
  };
  const time = instant(r.at);
  switch (r.type) {
    case 'rating':
      return [
        observation(ctx, 'fixture_screen', recordId, 'rating', category, item, {
          known: 1,
          consumed: 1,
          preference: {
            score: normalizeRating(r.rating!, RATING_SCALES.oneToTen),
            confidence: EXPLICIT_RATING_CONFIDENCE,
            basis: 'explicit_rating',
          },
        }, { time, engagement: { type: 'rating', value: r.rating!, unit: '1-10' } }),
      ];
    case 'watchlist':
      return [observation(ctx, 'fixture_screen', recordId, 'watchlist', category, item, { known: 1, consumed: 0 }, { time, engagement: { type: 'saved' } })];
    case 'watched':
      return [observation(ctx, 'fixture_screen', recordId, 'watched', category, item, { known: 1, consumed: 1 }, { time, engagement: { type: 'completed' } })];
  }
}

/** Diario de películas y libros: estrellas 0,5–5 (escala propia), «quiero» y registros sin nota. */
export function mapDiaryRecord(raw: unknown, ctx: NormalizeContext): NormalizedObservation[] {
  const r = diaryRecordSchema.parse(raw);
  const film = r.kind === 'film';
  const category: Category = film ? 'movies' : 'books';
  const canonicalIds: Record<string, string> = {
    ...(r.ref.imdb ? { 'imdb:title': r.ref.imdb } : {}),
    ...(r.ref.openlibrary ? { 'openlibrary:work': r.ref.openlibrary } : {}),
    ...(r.ref.isbn13 ? { 'isbn:isbn13': r.ref.isbn13 } : {}),
  };
  const sourceId = r.ref.imdb ?? r.ref.openlibrary ?? r.ref.isbn13 ?? `entry:${r.entryId}`;
  const item: Item = {
    sourceId,
    itemType: film ? 'movie' : 'book',
    title: r.ref.title,
    ...(Object.keys(canonicalIds).length ? { canonicalIds } : {}),
    ...(r.ref.year || r.ref.author
      ? { attributes: { ...(r.ref.year ? { releaseYear: r.ref.year } : {}), ...(r.ref.author ? { creators: [r.ref.author] } : {}) } }
      : {}),
  };
  const time = partialDate(r.date);
  const metadata = r.ref.isbn13 ? { edition: { isbn13: r.ref.isbn13 } } : {};
  switch (r.status) {
    case 'want':
      return [observation(ctx, 'fixture_diary', r.entryId, 'want', category, item, { known: 1, consumed: 0 }, { time, engagement: { type: 'saved' }, metadata })];
    case 'logged':
      return [observation(ctx, 'fixture_diary', r.entryId, 'log', category, item, { known: 1, consumed: 1 }, { time, engagement: { type: 'completed' }, metadata })];
    case 'rated':
      return [
        observation(ctx, 'fixture_diary', r.entryId, 'rating', category, item, {
          known: 1,
          consumed: 1,
          preference: {
            score: normalizeRating(r.stars!, RATING_SCALES.halfToFiveStars),
            confidence: EXPLICIT_RATING_CONFIDENCE,
            basis: 'explicit_rating',
          },
        }, { time, engagement: { type: 'rating', value: r.stars!, unit: '0.5-5' }, metadata }),
      ];
  }
}

/**
 * Actividad y lugares (clase Google): guardado ⇒ solo conocimiento; reseña 1–5 ⇒ valoración explícita; visita
 * con evidencia suficiente o asistencia confirmada ⇒ +1 por regla de producto; evento de calendario ⇒
 * conocimiento aproximado sin consumo ni preferencia; pulgares ⇒ like/dislike explícito.
 */
export function mapActivityRecord(raw: unknown, ctx: NormalizeContext): NormalizedObservation[] {
  const r = activityRecordSchema.parse(raw);
  const entityKey = r.entity.wikidataId ?? r.entity.kgId ?? `name:${r.entity.name}`;
  const itemType = r.category === 'food' ? 'restaurant' : r.category === 'culture' ? 'venue' : 'movie';
  const item: Item = {
    sourceId: entityKey,
    itemType,
    title: r.entity.name,
    canonicalIds: {
      ...(r.entity.wikidataId ? { 'wikidata:entity': r.entity.wikidataId } : {}),
      ...(r.entity.kgId ? { 'freebase:mid': r.entity.kgId } : {}),
    },
    ...(r.entity.lat !== undefined && r.entity.lng !== undefined
      ? { attributes: { location: { latitude: r.entity.lat, longitude: r.entity.lng } } }
      : {}),
  };
  const time = instant(r.at);
  const S = 'fixture_activity' as const;
  switch (r.action) {
    case 'saved':
      return [observation(ctx, S, `saved:${entityKey}`, 'saved', r.category, item, { known: 1, consumed: 0 }, { time, engagement: { type: 'saved' } })];
    case 'review':
      return [
        observation(ctx, S, `review:${entityKey}`, 'review', r.category, item, {
          known: 1,
          consumed: 1,
          preference: {
            score: normalizeRating(r.stars!, RATING_SCALES.oneToFiveStars),
            confidence: EXPLICIT_RATING_CONFIDENCE,
            basis: 'explicit_rating',
          },
        }, { time, engagement: { type: 'review', value: r.stars!, unit: '1-5' } }),
      ];
    case 'visit':
      return [
        observation(ctx, S, r.activityId, 'visit', r.category, item, {
          known: 1,
          consumed: 1,
          preference: { score: 1, confidence: VISIT_CONFIDENCE, basis: 'attendance' },
        }, { time, engagement: { type: 'attendance' }, metadata: { inference: 'visita con evidencia suficiente' } }),
      ];
    case 'attended':
      return [
        observation(ctx, S, r.activityId, 'attendance', r.category, item, {
          known: 1,
          consumed: 1,
          preference: { score: 1, confidence: ATTENDANCE_CONFIDENCE, basis: 'attendance' },
        }, { time, engagement: { type: 'attendance' }, metadata: { inference: 'asistencia confirmada' } }),
      ];
    case 'calendar_event':
      return [
        observation(ctx, S, r.activityId, 'planned_event', r.category, item, { known: PLANNED_EVENT_KNOWN, consumed: 0 }, {
          time,
          metadata: { inference: 'evento previsto: no prueba asistencia' },
        }),
      ];
    case 'thumbs_up':
    case 'thumbs_down':
      return [
        observation(ctx, S, `like:${entityKey}`, 'like', r.category, item, {
          known: 1,
          consumed: 0,
          preference: {
            score: r.action === 'thumbs_up' ? THUMBS_SCORE : -THUMBS_SCORE,
            confidence: THUMBS_CONFIDENCE,
            basis: 'explicit_like',
          },
        }, { time, engagement: { type: 'liked', value: r.action === 'thumbs_up' ? 1 : -1 } }),
      ];
  }
}

/**
 * Biblioteca de juegos (clase Steam, instantánea): 0 minutos ⇒ conocido sin consumo ni preferencia; con horas
 * ⇒ consumido; desde 2 h, preferencia positiva inferida y calibrada con el p95 del propio usuario.
 */
export function mapPlayRecord(raw: unknown, ctx: NormalizeContext): NormalizedObservation[] {
  const r = playRecordSchema.parse(raw);
  const hours = r.playtime_forever / 60;
  const recordId = `app:${r.appid}`;
  const item: Item = { sourceId: recordId, itemType: 'game', title: r.name, canonicalIds: { 'steam:app': String(r.appid) } };
  const time = r.rtime_last_played ? instant(new Date(r.rtime_last_played * 1000).toISOString()) : null;
  const metadata = { snapshot: true, playtimeForeverMinutes: r.playtime_forever, playtime2WeeksMinutes: r.playtime_2weeks ?? 0 };
  if (r.playtime_forever === 0) {
    return [
      observation(ctx, 'fixture_play', recordId, 'library', 'games', item, { known: 1, consumed: 0 }, {
        time,
        engagement: { type: 'owned', value: 0, unit: 'hours' },
        metadata,
      }),
    ];
  }
  const score = playtimePreference(hours, ctx.stats?.playtimeP95Hours ?? null, PLAY_MIN_HOURS_FOR_PREFERENCE);
  return [
    observation(ctx, 'fixture_play', recordId, 'library', 'games', item, {
      known: 1,
      consumed: 1,
      preference: score === null ? null : { score, confidence: PLAY_PREFERENCE_CONFIDENCE, basis: 'strong_behavior' },
    }, { time, engagement: { type: 'played', value: Math.round(hours * 10) / 10, unit: 'hours' }, metadata }),
  ];
}

/**
 * Música y podcasts (clase Last.fm): escuchas por artista con preferencia logarítmica calibrada por usuario;
 * canciones favoritas agregadas al artista; episodios agregados por programa; suscripción ⇒ solo conocimiento.
 */
export function mapAudioRecord(raw: unknown, ctx: NormalizeContext): NormalizedObservation[] {
  const r = audioRecordSchema.parse(raw);
  const S = 'fixture_audio' as const;
  switch (r.kind) {
    case 'artist_playcount': {
      const item: Item = { sourceId: `artist:${r.artist.mbid}`, itemType: 'artist', title: r.artist.name, canonicalIds: { 'musicbrainz:artist': r.artist.mbid } };
      const score = frequencyPreference(r.playcount, ctx.stats?.artistPlaycountP95 ?? null, AUDIO_MIN_PLAYS_FOR_PREFERENCE);
      return [
        observation(ctx, S, `artist:${r.artist.mbid}`, 'playcount', 'music', item, {
          known: 1,
          consumed: r.playcount > 0 ? 1 : 0,
          preference: score === null ? null : { score, confidence: AUDIO_PREFERENCE_CONFIDENCE, basis: 'strong_behavior' },
        }, { engagement: { type: 'listened', value: r.playcount, unit: 'plays' }, metadata: { snapshot: true } }),
      ];
    }
    case 'loved_track': {
      const item: Item = { sourceId: `artist:${r.artist.mbid}`, itemType: 'artist', title: r.artist.name, canonicalIds: { 'musicbrainz:artist': r.artist.mbid } };
      return [
        observation(ctx, S, `loved:${r.id}`, 'loved_track', 'music', item, {
          known: 1,
          consumed: 1,
          preference: { score: LOVED_TRACK_SCORE, confidence: LOVED_TRACK_CONFIDENCE, basis: 'explicit_like' },
        }, {
          time: instant(r.at),
          engagement: { type: 'liked' },
          // La canción se agrega al artista; se conserva el origen y el alcance de la evidencia.
          metadata: { track: r.track.name, scope: 'track', aggregatedTo: 'artist' },
        }),
      ];
    }
    case 'show_listening': {
      const item: Item = { sourceId: `show:${r.show.appleId}`, itemType: 'podcast', title: r.show.name, canonicalIds: { 'apple_podcasts:podcast': r.show.appleId } };
      const score = frequencyPreference(r.episodesPlayed, ctx.stats?.showEpisodesP95 ?? null, PODCAST_MIN_EPISODES_FOR_PREFERENCE);
      return [
        observation(ctx, S, `show:${r.show.appleId}`, 'listening', 'podcasts', item, {
          known: 1,
          consumed: 1,
          preference: score === null ? null : { score, confidence: PODCAST_PREFERENCE_CONFIDENCE, basis: 'strong_behavior' },
        }, {
          time: instant(r.lastPlayedAt),
          engagement: { type: 'listened', value: r.episodesPlayed, unit: 'episodes' },
          metadata: { aggregatedFrom: 'episodes', episodeIds: r.episodeIds },
        }),
      ];
    }
    case 'podcast_subscription': {
      const item: Item = { sourceId: `show:${r.show.appleId}`, itemType: 'podcast', title: r.show.name, canonicalIds: { 'apple_podcasts:podcast': r.show.appleId } };
      return [
        observation(ctx, S, `subscription:${r.show.appleId}`, 'subscription', 'podcasts', item, { known: 1, consumed: 0 }, {
          time: instant(r.at),
          engagement: { type: 'saved' },
          metadata: { inference: 'seguir un programa no demuestra haberlo escuchado' },
        }),
      ];
    }
    case 'podcast_episode':
      throw new Error('Los episodios se agregan por programa durante el sync antes de mapearse');
  }
}

export const FIXTURE_MAPPERS: Record<FixtureSourceKey, (raw: unknown, ctx: NormalizeContext) => NormalizedObservation[]> = {
  fixture_screen: mapScreenRecord,
  fixture_diary: mapDiaryRecord,
  fixture_activity: mapActivityRecord,
  fixture_play: mapPlayRecord,
  fixture_audio: mapAudioRecord,
};
