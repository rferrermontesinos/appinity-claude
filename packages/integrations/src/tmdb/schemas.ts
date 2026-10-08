import { z } from 'zod';

export const requestTokenSchema = z.object({ success: z.boolean(), request_token: z.string().min(10) });
export const sessionSchema = z.object({ success: z.boolean(), session_id: z.string().min(10) });
export const accountSchema = z.object({ id: z.number().int().positive(), username: z.string().optional() });

/** Elemento de una lista personal (películas usan title/release_date; series, name/first_air_date). */
export const tmdbListItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  name: z.string().optional(),
  original_title: z.string().optional(),
  original_name: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  original_language: z.string().optional(),
  /** Solo en las listas de valorados: nota del usuario (0,5–10, pasos de 0,5). */
  rating: z.number().optional(),
});
export type TmdbListItem = z.infer<typeof tmdbListItemSchema>;

export const listPageSchema = z.object({
  page: z.number().int().min(1),
  total_pages: z.number().int().min(0),
  total_results: z.number().int().min(0),
  results: z.array(z.unknown()),
});

/** Registro que el sync entrega al mapper: el elemento con la lista y el tipo de medio de los que procede. */
export const tmdbRecordSchema = z.object({
  list: z.enum(['rating', 'favorite', 'watchlist']),
  media: z.enum(['movie', 'tv']),
  item: tmdbListItemSchema,
});
export type TmdbRecord = z.infer<typeof tmdbRecordSchema>;

/** Detalle de película o serie (catálogo) con `append_to_response=external_ids`. */
export const tmdbDetailsSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  name: z.string().optional(),
  original_title: z.string().optional(),
  original_name: z.string().optional(),
  original_language: z.string().optional(),
  overview: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  external_ids: z
    .object({
      imdb_id: z.string().nullable().optional(),
      wikidata_id: z.string().nullable().optional(),
    })
    .optional(),
});
export type TmdbDetails = z.infer<typeof tmdbDetailsSchema>;

export const findResultSchema = z.object({
  movie_results: z.array(z.object({ id: z.number().int().positive() })).default([]),
  tv_results: z.array(z.object({ id: z.number().int().positive() })).default([]),
});
