/**
 * TMDb · constantes del adapter de PERFIL, verificadas en la documentación oficial el 2026-10-08:
 * - Autorización del USUARIO: request token (60 min) → aprobación en themoviedb.org/authenticate/{token}?redirect_to=…
 *   → session_id (se trata como una contraseña) → DELETE /3/authentication/session para revocar.
 * - Señales personales: listas de valoradas, favoritas y pendientes (películas y series), sin fechas. No existe un
 *   historial de visionado en la API.
 */
import type { TmdbMedia } from '../../tmdb/constants.js';

export const TMDB_MAPPER_VERSION = 'tmdb-v1';

/**
 * Valoración explícita: escala real de 0,5 a 10 en pasos de 0,5 (RATING_SCALES.halfToTen; el ejemplo oficial de
 * «Add Rating» usa 8.5). No se aplica la fórmula de 1–10: 0,5 → −1, 10 → +1 y 5,25 → 0. Confianza máxima.
 */
export const TMDB_RATING_CONFIDENCE = 1;
/** Favorito = like explícito (como los pulgares), sin prueba de consumo. Propuesta sin calibrar. */
export const TMDB_FAVORITE_SCORE = 0.8;
export const TMDB_FAVORITE_CONFIDENCE = 0.9;

export type TmdbListKind = 'rating' | 'favorite' | 'watchlist';

/** Listas personales que se importan, con su ruta de la API v3. Las listas personalizadas no se importan (v1). */
export const TMDB_LISTS: ReadonlyArray<{ kind: TmdbListKind; media: TmdbMedia; path: string }> = [
  { kind: 'rating', media: 'movie', path: 'rated/movies' },
  { kind: 'rating', media: 'tv', path: 'rated/tv' },
  { kind: 'favorite', media: 'movie', path: 'favorite/movies' },
  { kind: 'favorite', media: 'tv', path: 'favorite/tv' },
  { kind: 'watchlist', media: 'movie', path: 'watchlist/movies' },
  { kind: 'watchlist', media: 'tv', path: 'watchlist/tv' },
];

/** Tope de páginas por lista (20 resultados por página): protege frente a bibliotecas enormes o bucles. */
export const TMDB_MAX_PAGES_PER_LIST = 250;
