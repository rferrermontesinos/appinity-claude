import { SourceError } from '@appinity/shared';
import {
  STEAM_API_BASE,
  STEAM_BACKOFF_BASE_MS,
  STEAM_MAX_RETRIES,
  STEAM_MAX_RETRY_AFTER_MS,
  STEAM_REQUEST_TIMEOUT_MS,
} from './constants.js';
import { ownedGamesSchema, playerSummariesSchema } from './schemas.js';

export interface SteamClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, STEAM_MAX_RETRY_AFTER_MS);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(0, date - Date.now()), STEAM_MAX_RETRY_AFTER_MS);
}

/**
 * Cliente mínimo de la Steam Web API (solo servidor). La clave nunca aparece en mensajes de error ni logs.
 * Reintenta 429, 5xx y errores de red con backoff exponencial; 401/403 no se reintentan.
 */
export class SteamClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: SteamClientOptions) {
    if (!options.apiKey) throw new SourceError('not_configured', 'Falta STEAM_WEB_API_KEY en la configuración del servidor', false);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? STEAM_API_BASE;
    this.maxRetries = options.maxRetries ?? STEAM_MAX_RETRIES;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private async call(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set('key', this.options.apiKey);
    url.searchParams.set('format', 'json');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let lastError: SourceError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const backoff = STEAM_BACKOFF_BASE_MS * 2 ** attempt;
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'appinity-claude/0.1' },
          signal: AbortSignal.timeout(STEAM_REQUEST_TIMEOUT_MS),
        });
      } catch {
        lastError = new SourceError('unavailable', 'No se pudo contactar con la Steam Web API (red o tiempo de espera)', true);
        if (attempt < this.maxRetries) await this.sleep(backoff);
        continue;
      }

      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new SourceError('bad_response', 'La Steam Web API devolvió una respuesta que no es JSON', true);
        }
      }
      if (response.status === 401 || response.status === 403) {
        throw new SourceError(
          'auth',
          'Steam rechaza la clave de la Web API (HTTP ' + response.status + '): revisa STEAM_WEB_API_KEY en .env',
          false,
        );
      }
      if (response.status === 429) {
        const wait = retryAfterMs(response.headers.get('retry-after')) ?? backoff;
        lastError = new SourceError('rate_limited', 'Steam limita temporalmente las peticiones (HTTP 429)', true, wait);
        if (attempt < this.maxRetries) await this.sleep(wait);
        continue;
      }
      if (response.status >= 500) {
        lastError = new SourceError('unavailable', `La Steam Web API no está disponible (HTTP ${response.status})`, true);
        if (attempt < this.maxRetries) await this.sleep(backoff);
        continue;
      }
      throw new SourceError('bad_response', `La Steam Web API respondió HTTP ${response.status}`, false);
    }
    throw lastError ?? new SourceError('unavailable', 'La Steam Web API no responde', true);
  }

  /** Visibilidad efectiva del perfil (1 = no visible, 3 = público) o null si la cuenta no existe. */
  async getPlayerVisibility(steamid: string): Promise<number | null> {
    const data = playerSummariesSchema.safeParse(await this.call('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamid }));
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada de GetPlayerSummaries', false);
    return data.data.response.players.find((p) => p.steamid === steamid)?.communityvisibilitystate ?? null;
  }

  /** Biblioteca completa o null si Steam no la muestra para esta clave (perfil o detalles de juegos privados). */
  async getOwnedGames(steamid: string): Promise<{ gameCount: number; games: unknown[] } | null> {
    const data = ownedGamesSchema.safeParse(
      await this.call('/IPlayerService/GetOwnedGames/v1/', {
        steamid,
        include_appinfo: '1',
        include_played_free_games: '1',
      }),
    );
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada de GetOwnedGames', false);
    const { game_count: gameCount, games } = data.data.response;
    if (gameCount === undefined) return null;
    return { gameCount, games: games ?? [] };
  }
}
