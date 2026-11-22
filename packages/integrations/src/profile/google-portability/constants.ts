/**
 * Google Data Portability API · constantes verificadas en la documentación oficial el 2026-10-09
 * (ver docs/integration-capabilities.md y docs/fuentes-de-datos.md):
 * - OAuth 2.0 de servidor web. Los scopes de Data Portability NO se pueden mezclar con otros (ni openid ni email) y
 *   nunca se pide `include_granted_scopes`. No hay, por tanto, identidad de la cuenta de Google en la conexión.
 * - El usuario elige en el consentimiento: una sola vez, 30 días o 180 días (`refresh_token_expires_in`). Con el
 *   cliente en modo «Testing», el acceso dura 7 días sea cual sea la elección, y la renovación solo existe en producción.
 * - Un export por grupo de recursos (Google lo recomienda): initiate → estado (IN_PROGRESS, COMPLETE, FAILED,
 *   CANCELLED) → URLs firmadas que caducan a las 6 h (los datos siguen 14 días). Revisar cada 5–60 min; máximo 7 días.
 * - Acceso temporal: un nuevo export por grupo cada 24 h (si no, 429 RESOURCE_EXHAUSTED_TIME_BASED). Acceso único: un
 *   segundo export devuelve RESOURCE_EXHAUSTED_ONE_TIME.
 */
export const GOOGLE_MAPPER_VERSION = 'google-portability-v1';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const PORTABILITY_API_BASE = 'https://dataportability.googleapis.com';
export const PORTABILITY_SCOPE_PREFIX = 'https://www.googleapis.com/auth/dataportability.';
export const GOOGLE_TERMS_URL = 'https://developers.google.com/data-portability/policy';

/** Grupos que importa la fase 3: valoraciones explícitas y lugares. Se piden solo los que se usan (scopes mínimos). */
export const PHASE3_RESOURCE_GROUPS = [
  'maps.reviews',
  'maps.starred_places',
  'search_ugc.media.reviews_and_stars',
  'search_ugc.media.thumbs',
  'search_ugc.media.watched',
] as const;

/**
 * Grupos de la fase 4: actividad de YouTube (incluye YouTube Music), biblioteca de YouTube Music y suscripciones.
 * Esquemas verificados el 2026-10-13 (docs/integration-capabilities.md).
 */
export const PHASE4_RESOURCE_GROUPS = ['myactivity.youtube', 'youtube.music', 'youtube.subscriptions'] as const;

/**
 * Grupos de la fase 11 (esquemas consultados el 2026-10-14): biblioteca de Google Play (libros, juegos, películas y
 * series), pedidos y reservas de comida y colecciones guardadas. Todos «Sensitive». Entran en el mismo consentimiento.
 */
export const PHASE11_RESOURCE_GROUPS = ['play.library', 'order_reserve.purchases_reservations', 'saved.collections'] as const;

/** Todos los grupos que importa APPINITY (los que pide el consentimiento por defecto). */
export const ALL_RESOURCE_GROUPS = [...PHASE3_RESOURCE_GROUPS, ...PHASE4_RESOURCE_GROUPS, ...PHASE11_RESOURCE_GROUPS] as const;
export type ResourceGroup = (typeof ALL_RESOURCE_GROUPS)[number];
export type YouTubeGroup = (typeof PHASE4_RESOURCE_GROUPS)[number];

export function isResourceGroup(value: string): value is ResourceGroup {
  return (ALL_RESOURCE_GROUPS as readonly string[]).includes(value);
}

export function isYouTubeGroup(value: string): value is YouTubeGroup {
  return (PHASE4_RESOURCE_GROUPS as readonly string[]).includes(value);
}

/** Tipo de observación por grupo (también son los tipos de la instantánea). */
export const OBSERVATION_KIND: Record<ResourceGroup, string> = {
  'maps.reviews': 'maps_review',
  'maps.starred_places': 'maps_starred',
  'search_ugc.media.reviews_and_stars': 'search_rating',
  'search_ugc.media.thumbs': 'search_thumb',
  'search_ugc.media.watched': 'search_watched',
  'myactivity.youtube': 'yt_plays',
  'youtube.music': 'ytm_library',
  'youtube.subscriptions': 'yt_subscription',
  'play.library': 'play_library',
  'order_reserve.purchases_reservations': 'food_order',
  'saved.collections': 'saved_place',
};

/** Re-export mínimo entre exports de un mismo grupo con acceso temporal (lo impone Google). */
export const EXPORT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Google da hasta 7 días a un export; pasado ese tiempo se abandona. */
export const EXPORT_MAX_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
/** Reintentos de un export FAILED (Google permite 3). */
export const EXPORT_MAX_RETRIES = 3;
/** Tamaño máximo descargado por archivo (protección). */
export const ARCHIVE_MAX_BYTES = 200 * 1024 * 1024;

/** Espera entre consultas del estado de un export según el tiempo transcurrido (Google: cada 5–60 min). */
export function pollDelayMs(elapsedMs: number): number {
  if (elapsedMs < 10 * 60_000) return 60_000;
  if (elapsedMs < 60 * 60_000) return 5 * 60_000;
  if (elapsedMs < 6 * 60 * 60_000) return 15 * 60_000;
  return 60 * 60_000;
}

/**
 * Normalización (propuestas sin calibrar, ver docs/decisions.md):
 * - Estrellas 1–5 (Maps y Búsqueda): (r − 3) / 2, confianza 1 × confianza de la identificación.
 * - Pulgar: like/dislike explícito ±0,8 con confianza 0,9 × identificación; consumo 0,7 (se puede valorar sin ver).
 */
export const STAR_SCALE = { min: 1, max: 5, step: 1 } as const;
export const THUMB_SCORE = 0.8;
export const THUMB_CONFIDENCE = 0.9;
export const THUMB_CONSUMED = 0.7;

/**
 * YouTube y YouTube Music (fase 4, propuestas sin calibrar):
 * - Escuchas agregadas por artista o programa: preferencia `min(1, log1p(n) / log1p(p95 del usuario))` desde 3
 *   escuchas (una escucha aislada confirma consumo, no gusto), confianza 0,6 × identificación.
 * - Se identifican como máximo los 400 canales más escuchados, 400 suscripciones y 300 artistas de la biblioteca:
 *   acota las consultas a Wikidata en historiales muy largos. Lo que queda fuera se informa.
 */
export const YT_MIN_PLAYS_FOR_PREFERENCE = 3;
export const YT_PREFERENCE_CONFIDENCE = 0.6;
export const YT_MAX_CHANNELS = 400;
export const YT_MAX_SUBSCRIPTIONS = 400;
export const YT_MAX_LIBRARY_ARTISTS = 300;

/**
 * Fase 11 (propuestas sin calibrar):
 * - Biblioteca de Play: conocido, no consumido, preferencia NULL (descargar o comprar no prueba uso ni gusto).
 * - Pedidos y reservas: conocido y consumido (se pidió o se fue). Desde 2 visitas, preferencia inferida
 *   `min(1, log1p(n) / log1p(p95 del usuario))` con confianza 0,5 (repetir sugiere gusto, pero es conducta).
 * - Guardados: conocido, no consumido, preferencia NULL (§5: guardar no prueba gusto), como los sitios con estrella.
 * - Topes por sync: 400 objetos de Play y 150 lugares sin coordenadas (la geocodificación pública admite 1 consulta/s).
 */
export const FOOD_MIN_VISITS_FOR_PREFERENCE = 2;
export const FOOD_PREFERENCE_CONFIDENCE = 0.5;
export const PLAY_MAX_ITEMS = 400;
export const TEXT_PLACES_MAX = 150;

/** Las estrellas de la Búsqueda llegan como texto («Five stars»). Escala por confirmar con un export real. */
export const STAR_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};
