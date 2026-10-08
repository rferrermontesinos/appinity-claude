/**
 * TMDb · constantes comunes al adapter de perfil y al proveedor de catálogo, verificadas en la documentación y las
 * condiciones oficiales el 2026-10-08 (ver docs/integration-capabilities.md):
 * - Autenticación de la APLICACIÓN: «API Read Access Token» como `Authorization: Bearer` (vale para v3 y v4).
 * - Límite orientativo: ~40 peticiones/s; respetar los 429.
 * - Imágenes: https://image.tmdb.org/t/p/{tamaño}{ruta}. Atribución obligatoria (logo + aviso en «Acerca de»).
 * - Condiciones §1.C: no cachear contenido de TMDb más de 6 meses.
 */
export const TMDB_API_BASE = 'https://api.themoviedb.org';
export const TMDB_SITE_BASE = 'https://www.themoviedb.org';
export const TMDB_TERMS_URL = 'https://www.themoviedb.org/api-terms-of-use';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
/** Aviso exigido por TMDb en la sección de créditos de la app. */
export const TMDB_NOTICE = 'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';

export const TMDB_CACHE_MAX_DAYS = 180;

export const TMDB_MAX_RETRIES = 3;
export const TMDB_BACKOFF_BASE_MS = 1_000;
export const TMDB_MAX_RETRY_AFTER_MS = 30_000;
export const TMDB_REQUEST_TIMEOUT_MS = 15_000;

export type TmdbMedia = 'movie' | 'tv';

export function tmdbAuthorizeUrl(requestToken: string, redirectTo: string): string {
  return `${TMDB_SITE_BASE}/authenticate/${encodeURIComponent(requestToken)}?redirect_to=${encodeURIComponent(redirectTo)}`;
}
