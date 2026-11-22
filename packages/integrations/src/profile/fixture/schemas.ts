import { z } from 'zod';

/** Esquemas de los registros "en bruto" de cada fuente simulada. Validan antes de mapear. */

const isoInstant = z.iso.datetime({ offset: true });

export const screenRecordSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['rating', 'watchlist', 'watched']),
    media: z.object({
      kind: z.enum(['movie', 'tv']),
      tmdbId: z.number().int().positive(),
      imdbId: z.string().regex(/^tt\d+$/).optional(),
      title: z.string().min(1),
      year: z.number().int().min(1870).max(2100).optional(),
    }),
    rating: z.number().int().min(1).max(10).optional(),
    at: isoInstant.nullable(),
  })
  .refine((r) => (r.type === 'rating') === (r.rating !== undefined), {
    message: 'Solo los registros de tipo rating llevan valoración (1–10)',
    path: ['rating'],
  });
export type ScreenRecord = z.infer<typeof screenRecordSchema>;

export const diaryRecordSchema = z
  .object({
    entryId: z.string().min(1),
    kind: z.enum(['film', 'book']),
    ref: z.object({
      imdb: z.string().regex(/^tt\d+$/).optional(),
      isbn13: z.string().regex(/^97[89]\d{10}$/).optional(),
      openlibrary: z.string().regex(/^OL\d+W$/).optional(),
      title: z.string().min(1),
      year: z.number().int().min(1000).max(2100).optional(),
      author: z.string().min(1).optional(),
    }),
    status: z.enum(['want', 'logged', 'rated']),
    stars: z.number().min(0.5).max(5).multipleOf(0.5).optional(),
    date: z
      .string()
      .regex(/^\d{4}(-\d{2}-\d{2})?$/)
      .nullable(),
  })
  .refine((r) => (r.status === 'rated') === (r.stars !== undefined), {
    message: 'Solo las entradas rated llevan estrellas',
    path: ['stars'],
  });
export type DiaryRecord = z.infer<typeof diaryRecordSchema>;

export const activityRecordSchema = z
  .object({
    activityId: z.string().min(1),
    category: z.enum(['food', 'culture', 'movies']),
    entity: z.object({
      wikidataId: z.string().regex(/^Q\d+$/).optional(),
      kgId: z.string().regex(/^\/m\/[0-9a-z_]+$/).optional(),
      name: z.string().min(1),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    }),
    action: z.enum(['saved', 'review', 'visit', 'attended', 'calendar_event', 'thumbs_up', 'thumbs_down']),
    stars: z.number().int().min(1).max(5).optional(),
    at: isoInstant.nullable(),
  })
  .refine((r) => (r.action === 'review') === (r.stars !== undefined), {
    message: 'Solo las reseñas llevan estrellas (1–5)',
    path: ['stars'],
  });
export type ActivityRecord = z.infer<typeof activityRecordSchema>;

export const playRecordSchema = z.object({
  appid: z.number().int().positive(),
  name: z.string().min(1),
  /** Minutos acumulados (instantánea). */
  playtime_forever: z.number().int().min(0),
  playtime_2weeks: z.number().int().min(0).optional(),
  /** Unix epoch en segundos; 0 = nunca jugado. */
  rtime_last_played: z.number().int().min(0).optional(),
});
export type PlayRecord = z.infer<typeof playRecordSchema>;

const artistRef = z.object({ name: z.string().min(1), mbid: z.uuid() });
const showRef = z.object({ name: z.string().min(1), appleId: z.string().regex(/^\d+$/) });

export const audioRecordSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artist_playcount'), artist: artistRef, playcount: z.number().int().min(0) }),
  z.object({
    kind: z.literal('loved_track'),
    id: z.string().min(1),
    artist: artistRef,
    track: z.object({ name: z.string().min(1) }),
    at: isoInstant.nullable(),
  }),
  z.object({
    kind: z.literal('podcast_episode'),
    id: z.string().min(1),
    show: showRef,
    episode: z.object({ title: z.string().min(1).optional(), number: z.number().int().positive().optional() }),
    at: isoInstant,
  }),
  z.object({ kind: z.literal('podcast_subscription'), show: showRef, at: isoInstant.nullable() }),
  /** Registro sintético: episodios agregados por programa durante el sync. */
  z.object({
    kind: z.literal('show_listening'),
    show: showRef,
    episodesPlayed: z.number().int().min(1),
    episodeIds: z.array(z.string()),
    lastPlayedAt: isoInstant.nullable(),
  }),
]);
export type AudioRecord = z.infer<typeof audioRecordSchema>;

/** Archivo de fixtures: registros por usuario simulado. */
export const fixtureFileSchema = z.object({
  source: z.string(),
  note: z.string(),
  users: z.array(z.object({ userId: z.uuid(), handle: z.string(), records: z.array(z.unknown()) })),
});
export type FixtureFile = z.infer<typeof fixtureFileSchema>;
