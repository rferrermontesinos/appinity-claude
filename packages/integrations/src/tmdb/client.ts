import { SourceError } from '@appinity/shared';
import {
  TMDB_API_BASE,
  TMDB_BACKOFF_BASE_MS,
  TMDB_MAX_RETRIES,
  TMDB_MAX_RETRY_AFTER_MS,
  TMDB_REQUEST_TIMEOUT_MS,
  type TmdbMedia,
} from './constants.js';
import {
  accountSchema,
  findResultSchema,
  listPageSchema,
  requestTokenSchema,
  sessionSchema,
  tmdbDetailsSchema,
  tmdbListItemSchema,
  type TmdbDetails,
  type TmdbListItem,
} from './schemas.js';

export interface TmdbClientOptions {
  /** «API Read Access Token» de la aplicación (autenticación de catálogo). Solo servidor. */
  readToken: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, TMDB_MAX_RETRY_AFTER_MS) : undefined;
}

/**
 * Cliente de la API v3 de TMDb (solo servidor). El token de la app va en `Authorization: Bearer`; la sesión del
 * usuario, como `session_id`, solo en las llamadas a su cuenta. Ningún secreto aparece en los mensajes de error.
 */
export class TmdbClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TmdbClientOptions) {
    if (!options.readToken) throw new SourceError('not_configured', 'Falta TMDB_API_READ_TOKEN en la configuración del servidor', false);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? TMDB_API_BASE;
    this.maxRetries = options.maxRetries ?? TMDB_MAX_RETRIES;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: { query?: Record<string, string>; body?: unknown; sessionId?: string } = {},
  ): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
    if (options.sessionId) url.searchParams.set('session_id', options.sessionId);

    let lastError: SourceError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const backoff = TMDB_BACKOFF_BASE_MS * 2 ** attempt;
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.options.readToken}`,
            Accept: 'application/json',
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          signal: AbortSignal.timeout(TMDB_REQUEST_TIMEOUT_MS),
        });
      } catch {
        lastError = new SourceError('unavailable', 'No se pudo contactar con TMDb (red o tiempo de espera)', true);
        if (attempt < this.maxRetries) await this.sleep(backoff);
        continue;
      }
      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new SourceError('bad_response', 'TMDb devolvió una respuesta que no es JSON', true);
        }
      }
      if (response.status === 401) {
        throw new SourceError(
          'auth',
          options.sessionId
            ? 'La autorización de TMDb ya no es válida (¿la revocaste en TMDb?): vuelve a conectar TMDb'
            : 'TMDb rechaza el token de la aplicación: revisa TMDB_API_READ_TOKEN en .env',
          false,
        );
      }
      if (response.status === 429) {
        const wait = retryAfterMs(response.headers.get('retry-after')) ?? backoff;
        lastError = new SourceError('rate_limited', 'TMDb limita temporalmente las peticiones (HTTP 429)', true, wait);
        if (attempt < this.maxRetries) await this.sleep(wait);
        continue;
      }
      if (response.status >= 500) {
        lastError = new SourceError('unavailable', `TMDb no está disponible (HTTP ${response.status})`, true);
        if (attempt < this.maxRetries) await this.sleep(backoff);
        continue;
      }
      throw new SourceError(
        response.status === 404 ? 'not_found' : 'bad_response',
        `TMDb respondió HTTP ${response.status} en ${path.replace(/\d+/g, ':id')}`,
        false,
      );
    }
    throw lastError ?? new SourceError('unavailable', 'TMDb no responde', true);
  }

  async createRequestToken(): Promise<string> {
    const data = requestTokenSchema.safeParse(await this.request('GET', '/3/authentication/token/new'));
    if (!data.success || !data.data.success) throw new SourceError('bad_response', 'TMDb no generó el token de autorización', true);
    return data.data.request_token;
  }

  async createSession(requestToken: string): Promise<string> {
    let raw: unknown;
    try {
      raw = await this.request('POST', '/3/authentication/session/new', { body: { request_token: requestToken } });
    } catch (error) {
      // Un token no aprobado (denegado o caducado) responde 401: no es un fallo del token de la aplicación.
      if (error instanceof SourceError && error.code === 'auth') {
        throw new SourceError('verification_failed', 'TMDb no confirmó la autorización (¿se denegó o caducó?): vuelve a intentarlo', false);
      }
      throw error;
    }
    const data = sessionSchema.safeParse(raw);
    if (!data.success || !data.data.success) {
      throw new SourceError('verification_failed', 'TMDb no confirmó la autorización: vuelve a intentarlo', false);
    }
    return data.data.session_id;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', '/3/authentication/session', { body: { session_id: sessionId } });
  }

  /**
   * Cuenta dueña de la sesión. La referencia documenta `/3/account/{account_id}`, pero el id aún no se conoce: la
   * sesión determina la cuenta. Se usa `/3/account` y, si no existiera, la forma con un id de relleno.
   */
  async getAccount(sessionId: string): Promise<{ id: number; username?: string }> {
    let raw: unknown;
    try {
      raw = await this.request('GET', '/3/account', { sessionId });
    } catch (error) {
      if (!(error instanceof SourceError && error.code === 'not_found')) throw error;
      raw = await this.request('GET', '/3/account/0', { sessionId });
    }
    const data = accountSchema.safeParse(raw);
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada de la cuenta de TMDb', false);
    return data.data;
  }

  async listPage(accountId: string, sessionId: string, path: string, page: number) {
    const data = listPageSchema.safeParse(
      await this.request('GET', `/3/account/${encodeURIComponent(accountId)}/${path}`, {
        sessionId,
        query: { page: String(page), sort_by: 'created_at.asc', language: 'es-ES' },
      }),
    );
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada de una lista de TMDb', false);
    return data.data;
  }

  /** Catálogo: ficha de una película o serie con sus IDs externos (IMDb, Wikidata) para no duplicar objetos. */
  async getDetails(media: TmdbMedia, id: number, language = 'es-ES'): Promise<TmdbDetails> {
    const data = tmdbDetailsSchema.safeParse(
      await this.request('GET', `/3/${media}/${id}`, { query: { append_to_response: 'external_ids', language } }),
    );
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada de la ficha de TMDb', false);
    return data.data;
  }

  /** Catálogo: búsqueda por título (sin IDs externos; solo para sugerencias, nunca para fusionar objetos). */
  async search(media: TmdbMedia, query: string, language = 'es-ES'): Promise<TmdbListItem[]> {
    const data = listPageSchema.safeParse(
      await this.request('GET', `/3/search/${media}`, { query: { query, language, include_adult: 'false', page: '1' } }),
    );
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada de la búsqueda de TMDb', false);
    return data.data.results.flatMap((r) => {
      const item = tmdbListItemSchema.safeParse(r);
      return item.success ? [item.data] : [];
    });
  }

  /** Catálogo: busca por ID de IMDb (`/3/find`). Devuelve el ID de TMDb de la película o serie, si existe. */
  async findByImdbId(imdbId: string): Promise<{ media: TmdbMedia; id: number } | null> {
    const data = findResultSchema.safeParse(
      await this.request('GET', `/3/find/${encodeURIComponent(imdbId)}`, { query: { external_source: 'imdb_id' } }),
    );
    if (!data.success) throw new SourceError('bad_response', 'Respuesta inesperada de la búsqueda de TMDb', false);
    const movie = data.data.movie_results[0];
    if (movie) return { media: 'movie', id: movie.id };
    const tv = data.data.tv_results[0];
    return tv ? { media: 'tv', id: tv.id } : null;
  }
}
