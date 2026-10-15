import { normalizeRating } from '@appinity/algorithms';
import {
  SourceError,
  isSourceError,
  type AuthResult,
  type EntityIdentifier,
  type IdentifiedEntity,
  type NormalizeContext,
  type NormalizedObservation,
  type ProfileSourceAdapter,
  type ProfileSourceManifest,
  type SyncBatch,
  type SyncContext,
} from '@appinity/shared';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Trakt (fase 11): cine y series del usuario. Documentación oficial (developer.trakt.tv, consultada el 2026-10-15):
 * - OAuth con PKCE en auth.trakt.tv (el client_secret está obsoleto para usuarios y solo se usaría desde el servidor);
 *   access token de 7 días; cada renovación entrega un refresh token NUEVO que sustituye al anterior.
 * - API en https://api.trakt.tv con las cabeceras trakt-api-key (client_id) y trakt-api-version: 2.
 * - API Use Policy: con autorización del usuario y caché solo para sus funciones; prohíbe vender datos o copiar el
 *   catálogo. APPINITY guarda únicamente la evidencia del usuario e identifica cada título en Wikidata.
 * Identificación exacta: IMDb (P345) y, si falta, TMDB (P4947 películas, P4983 series).
 */
export const TRAKT_MAPPER_VERSION = 'trakt-v1';
const AUTH = 'https://auth.trakt.tv';
const API = 'https://api.trakt.tv';
const PAGE = 250;
const MAX_ITEMS = 2000;

export const TRAKT_MANIFEST: ProfileSourceManifest = {
  key: 'trakt',
  name: 'Trakt',
  categories: ['movies', 'series'],
  authentication: 'oauth2',
  syncStrategy: 'scheduled',
  capabilities: { known: true, consumed: true, explicitRating: true, implicitPreference: false, history: false, incrementalSync: false },
  availability: 'available',
  simulated: false,
  description: 'Tus películas y series en Trakt: valoraciones (1–10), vistas, favoritas y pendientes. Solo lectura.',
};

const idsSchema = z.object({ trakt: z.number().optional(), imdb: z.string().nullable().optional(), tmdb: z.number().nullable().optional() }).passthrough();
const mediaSchema = z.object({ title: z.string().optional(), year: z.number().nullable().optional(), ids: idsSchema });
const entrySchema = z
  .object({
    rating: z.number().optional(),
    rated_at: z.string().optional(),
    plays: z.number().optional(),
    last_watched_at: z.string().optional(),
    listed_at: z.string().optional(),
    movie: mediaSchema.optional(),
    show: mediaSchema.optional(),
  })
  .passthrough();
const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string(), expires_in: z.number().optional() });

export type TraktKind = 'movie' | 'show';

export interface TraktItem {
  kind: TraktKind;
  traktId: number;
  title: string;
  year?: number;
  imdb?: string;
  tmdb?: number;
  rating: number | null;
  plays: number;
  favorite: boolean;
  watchlist: boolean;
  date?: string;
}

type Entry = z.infer<typeof entrySchema>;

/** Une valoraciones, vistos, favoritos y pendientes por título (un mismo título puede estar en varias listas). */
export function collectTrakt(lists: { ratings: Entry[]; watched: Entry[]; favorites: Entry[]; watchlist: Entry[] }): TraktItem[] {
  const byKey = new Map<string, TraktItem>();
  const touch = (entry: Entry): TraktItem | null => {
    const kind: TraktKind | null = entry.movie ? 'movie' : entry.show ? 'show' : null;
    const media = entry.movie ?? entry.show;
    if (!kind || !media?.ids.trakt || !media.title) return null;
    const key = `${kind}:${media.ids.trakt}`;
    const current = byKey.get(key) ?? {
      kind,
      traktId: media.ids.trakt,
      title: media.title,
      ...(media.year ? { year: media.year } : {}),
      ...(media.ids.imdb ? { imdb: media.ids.imdb } : {}),
      ...(media.ids.tmdb ? { tmdb: media.ids.tmdb } : {}),
      rating: null,
      plays: 0,
      favorite: false,
      watchlist: false,
    };
    byKey.set(key, current);
    return current;
  };
  const later = (item: TraktItem, date?: string) => {
    if (date && (!item.date || date > item.date)) item.date = date;
  };
  for (const e of lists.ratings) {
    const item = touch(e);
    if (item && typeof e.rating === 'number' && e.rating >= 1 && e.rating <= 10) {
      item.rating = e.rating;
      later(item, e.rated_at);
    }
  }
  for (const e of lists.watched) {
    const item = touch(e);
    if (item) {
      item.plays = Math.max(item.plays, e.plays ?? 1);
      later(item, e.last_watched_at);
    }
  }
  for (const e of lists.favorites) {
    const item = touch(e);
    if (item) item.favorite = true;
  }
  for (const e of lists.watchlist) {
    const item = touch(e);
    if (item) item.watchlist = true;
  }
  return [...byKey.values()];
}

interface TraktRecord {
  recordId: string;
  item: TraktItem;
  identified: IdentifiedEntity;
}

/**
 * Normalización (`trakt-v1`, propuesta sin calibrar):
 * - Valoración 1–10: explícita, (r − 1) / 9 · 2 − 1; consumido.
 * - Favorito sin valoración: me gusta +0,8.
 * - Visto sin valoración ni favorito: consumido, preferencia NULL (ver no prueba gusto).
 * - Pendiente: conocido, no consumido, NULL.
 */
export function mapTrakt(raw: unknown, context: NormalizeContext): NormalizedObservation[] {
  const { recordId, item, identified } = raw as TraktRecord;
  const id = identified.confidence;
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  const consumed = item.rating !== null || item.plays > 0 || item.favorite;
  const base = {
    userId: context.userId,
    source: 'trakt' as const,
    sourceRecordId: recordId,
    observationKind: 'trakt_title',
    mapperVersion: TRAKT_MAPPER_VERSION,
    category: identified.category,
    externalItem: {
      sourceId: recordId,
      itemType: identified.itemType,
      title: identified.title,
      canonicalIds: { ...identified.canonicalIds, ...(item.imdb ? { 'imdb:title': item.imdb } : {}) },
      ...(identified.releaseYear ? { attributes: { releaseYear: identified.releaseYear } } : {}),
    },
    ...(item.date ? { occurredAt: item.date, timestampPrecision: 'instant' as const } : {}),
    knownConfidence: round(id),
    consumedConfidence: consumed ? round(id) : 0,
    metadata: { snapshot: true, plays: item.plays, favorite: item.favorite, watchlist: item.watchlist, identification: { method: identified.method, confidence: id } },
  };
  if (item.rating !== null) {
    return [
      {
        ...base,
        preferenceScore: normalizeRating(item.rating, { min: 1, max: 10, step: 1 }),
        preferenceConfidence: round(id),
        preferenceBasis: 'explicit_rating',
        engagement: { type: 'rating', value: item.rating, unit: 'stars_1_10' },
      },
    ];
  }
  if (item.favorite) {
    return [{ ...base, preferenceScore: 0.8, preferenceConfidence: round(0.9 * id), preferenceBasis: 'explicit_like', engagement: { type: 'liked', value: 1 } }];
  }
  return [
    {
      ...base,
      preferenceScore: null,
      preferenceConfidence: null,
      preferenceBasis: null,
      engagement: item.plays > 0 ? { type: 'completed', value: item.plays, unit: 'plays' } : { type: 'saved', unit: 'watchlist' },
    },
  ];
}

export interface TraktOptions {
  clientId: string;
  /** Solo servidor a servidor (Trakt lo marca como obsoleto para usuarios). Opcional: con PKCE no hace falta. */
  clientSecret?: string;
  redirectUri: string;
  /** Solo el worker (sync). */
  identifier?: EntityIdentifier;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export function createTraktAdapter(options: TraktOptions): ProfileSourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = (token?: string) => ({
    'Content-Type': 'application/json',
    'trakt-api-key': options.clientId,
    'trakt-api-version': '2',
    'User-Agent': options.userAgent ?? 'APPINITY/0.1',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  async function token(body: Record<string, string>): Promise<z.infer<typeof tokenSchema>> {
    const response = await fetchImpl(`${AUTH}/oauth/token`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ client_id: options.clientId, redirect_uri: options.redirectUri, ...(options.clientSecret ? { client_secret: options.clientSecret } : {}), ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 400 || response.status === 401) throw new SourceError('auth', 'El permiso de Trakt ha caducado o se ha revocado: vuelve a conectarlo', false);
    if (!response.ok) throw new SourceError('unavailable', `Trakt respondió HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    return tokenSchema.parse(await response.json());
  }

  async function list(accessToken: string, path: string, paged: boolean): Promise<Entry[]> {
    const out: Entry[] = [];
    for (let page = 1; out.length < MAX_ITEMS; page++) {
      const url = `${API}${path}${paged ? `?page=${page}&limit=${PAGE}` : ''}`;
      const response = await fetchImpl(url, { headers: headers(accessToken), signal: AbortSignal.timeout(20_000) });
      if (response.status === 401) throw new SourceError('auth', 'El permiso de Trakt ya no es válido: vuelve a conectarlo', false);
      if (response.status === 429 || response.status >= 500) throw new SourceError('unavailable', `Trakt respondió HTTP ${response.status}`, true);
      if (!response.ok) throw new SourceError('bad_response', `Trakt respondió HTTP ${response.status}`, false);
      const items = z.array(entrySchema).parse(await response.json());
      out.push(...items);
      const pages = Number(response.headers.get('x-pagination-page-count') ?? '1');
      if (!paged || !items.length || page >= pages) break;
    }
    return out;
  }

  return {
    manifest: TRAKT_MANIFEST,
    supportsRenewal: true,
    snapshotObservationKinds: ['trakt_title'],
    async connect(context): Promise<AuthResult> {
      if (!context.state) throw new SourceError('not_configured', 'Falta el state del flujo de autorización', false);
      const verifier = randomBytes(48).toString('base64url');
      const url = new URL(`${AUTH}/oauth/authorize`);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', options.clientId);
      url.searchParams.set('redirect_uri', options.redirectUri);
      url.searchParams.set('state', context.state);
      url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
      url.searchParams.set('code_challenge_method', 'S256');
      return { kind: 'redirect', url: url.toString(), state: context.state, pending: { codeVerifier: verifier } };
    },
    async completeConnect(context): Promise<AuthResult> {
      const params = context.callbackParams;
      if (params.error) throw new SourceError('verification_failed', params.error === 'access_denied' ? 'Se canceló la autorización en Trakt' : 'Trakt no concedió el acceso', false);
      const verifier = context.pending?.codeVerifier;
      if (!params.code || !verifier) throw new SourceError('verification_failed', 'Respuesta de Trakt incompleta: vuelve a intentarlo', false);
      const t = await token({ grant_type: 'authorization_code', code: params.code, code_verifier: verifier });
      return { kind: 'connected', credentials: { refreshToken: t.refresh_token }, scopes: ['public'] };
    },
    async sync(context: SyncContext): Promise<SyncBatch> {
      const identifier = options.identifier;
      if (!identifier) throw new SourceError('not_configured', 'Falta el identificador de catálogo para Trakt', false);
      const refreshToken = context.credentials?.refreshToken;
      if (!refreshToken) throw new SourceError('verification_failed', 'La conexión con Trakt está incompleta: vuelve a conectarla', false);
      const t = await token({ grant_type: 'refresh_token', refresh_token: refreshToken });
      // Trakt invalida el refresh token anterior: el nuevo se guarda antes de seguir.
      await context.saveState?.({ refreshToken: t.refresh_token });
      const fetchBoth = async (path: (type: string) => string, paged: boolean) => [
        ...(await list(t.access_token, path('movies'), paged)),
        ...(await list(t.access_token, path('shows'), paged)),
      ];
      const items = collectTrakt({
        ratings: await fetchBoth((type) => `/sync/ratings/${type}`, true),
        watched: await fetchBoth((type) => `/sync/watched/${type}`, false),
        favorites: await fetchBoth((type) => `/sync/favorites/${type}/rank/asc`, true),
        watchlist: await fetchBoth((type) => `/sync/watchlist/${type}/rank/asc`, true),
      });
      const records: TraktRecord[] = [];
      let unidentified = 0;
      try {
        const found = identifier.identifyByExternalIds
          ? await identifier.identifyByExternalIds(items.map((i) => ({ imdb: i.imdb, tmdb: i.tmdb, kind: i.kind })))
          : items.map(() => null);
        for (const [i, item] of items.entries()) {
          const entity =
            found[i] ??
            (await identifier.identifyWork({ title: item.title, languages: ['en', 'es'], categories: [item.kind === 'movie' ? 'movies' : 'series'] }));
          if (entity) records.push({ recordId: `${item.kind}:${item.traktId}`, item, identified: entity });
          else unidentified++;
        }
      } catch (error) {
        if (isSourceError(error) && error.retryable) {
          return { records: [], cursor: null, hasMore: false, partialErrors: [], snapshotComplete: false, pending: { retryAfterMs: 10 * 60_000, reason: `${error.message} (identificación de catálogo)` } };
        }
        throw error;
      }
      return {
        records,
        cursor: null,
        hasMore: false,
        partialErrors: unidentified ? [{ code: 'unidentified', message: `${unidentified} de ${items.length} títulos de Trakt no se pudieron identificar con seguridad`, blocking: false }] : [],
        snapshotComplete: true,
        snapshotKinds: ['trakt_title'],
        stats: { trakt_exported: items.length, trakt_identified: records.length },
      };
    },
    normalize: async (record, context) => mapTrakt(record, context),
    async disconnect(_connection, credentials) {
      // Trakt revoca con el access token: se obtiene uno con el refresh token y se revoca.
      const refresh = credentials?.refreshToken;
      if (!refresh) return;
      const t = await token({ grant_type: 'refresh_token', refresh_token: refresh }).catch(() => null);
      if (t) {
        await fetchImpl(`${AUTH}/oauth/revoke`, { method: 'POST', headers: headers(), body: JSON.stringify({ token: t.access_token, client_id: options.clientId }) }).catch(() => undefined);
      }
    },
  };
}
