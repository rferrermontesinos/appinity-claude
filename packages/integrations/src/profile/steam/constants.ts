/**
 * Steam · constantes verificadas en la documentación oficial el 2026-10-08 (ver docs/integration-capabilities.md):
 * - OpenID 2.0: proveedor https://steamcommunity.com/openid, endpoint de login https://steamcommunity.com/openid/login,
 *   Claimed ID https://steamcommunity.com/openid/id/<steamid>. Solo identifica la cuenta (SteamID).
 * - Web API: https://api.steampowered.com/<interfaz>/<método>/v<versión>/ con clave de usuario (Terms of Use:
 *   100.000 llamadas/día, clave confidencial).
 */
export const STEAM_MAPPER_VERSION = 'steam-v1';

export const OPENID_NS = 'http://specs.openid.net/auth/2.0';
export const OPENID_IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
/** El Claimed ID contiene el SteamID de 64 bits (se trata siempre como texto: supera 2^53). */
export const STEAM_CLAIMED_ID_PATTERN = /^https?:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;
export const STEAMID64_PATTERN = /^7656119\d{10}$/;
/** Campos que la respuesta OpenID debe firmar para aceptarla. */
export const OPENID_REQUIRED_SIGNED = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];
/** Antigüedad máxima del nonce de la respuesta OpenID. */
export const OPENID_MAX_NONCE_AGE_MS = 5 * 60 * 1000;

export const STEAM_API_BASE = 'https://api.steampowered.com';
export const STEAM_TERMS_URL = 'https://steamcommunity.com/dev/apiterms';
export const STEAM_DAILY_CALL_LIMIT = 100_000;

/** Visibilidad efectiva de GetPlayerSummaries: 1 = no visible para quien pregunta, 3 = pública. */
export const STEAM_VISIBILITY_PUBLIC = 3;

/** Reintentos ante 429/5xx/red, con backoff exponencial y respeto de Retry-After (máx. 30 s). */
export const STEAM_MAX_RETRIES = 3;
export const STEAM_BACKOFF_BASE_MS = 1_000;
export const STEAM_MAX_RETRY_AFTER_MS = 30_000;
export const STEAM_REQUEST_TIMEOUT_MS = 15_000;

/** Mismas propuestas que la fuente simulada de juegos (docs/decisions.md), pendientes de calibrar. */
export const STEAM_MIN_HOURS_FOR_PREFERENCE = 2;
export const STEAM_PREFERENCE_CONFIDENCE = 0.6;

/**
 * Cápsula vertical 600×900 del CDN público de Steam. El patrón no forma parte de la documentación de la Web API:
 * se guarda solo como REFERENCIA (no se copia el archivo) y la app usa el fallback si no carga.
 */
export function steamCapsuleUrl(appid: number): string {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;
}

export function steamStoreUrl(appid: number): string {
  return `https://store.steampowered.com/app/${appid}/`;
}
