import { normalizeRating } from '@appinity/algorithms';
import {
  SourceError,
  isSourceError,
  type AuthResult,
  type Category,
  type EntityIdentifier,
  type IdentifiedEntity,
  type NormalizeContext,
  type NormalizedObservation,
  type ProfileSourceAdapter,
  type ProfileSourceManifest,
  type SyncBatch,
  type SyncContext,
} from '@appinity/shared';
import { z } from 'zod';

/**
 * AniList (fase 11): anime y manga del usuario. Documentación oficial (docs.anilist.co, consultada el 2026-10-16):
 * - OAuth 2 con «authorization code grant» (el secreto se queda en el servidor). Sin scopes; el access token dura
 *   1 año y no hay refresh token: al caducar, el usuario vuelve a conectar.
 * - API GraphQL en https://graphql.anilist.co (límite orientativo de 90 peticiones por minuto; 429 con Retry-After).
 * - Condiciones: uso gratuito por debajo de 150 $ al mes de ingresos; no copiar el catálogo. APPINITY guarda solo la
 *   evidencia del usuario e identifica cada obra en Wikidata.
 * Identificación exacta: AniList (P8729 anime, P8731 manga) y, si falta, MyAnimeList (P4086 anime, P4087 manga).
 */
export const ANILIST_MAPPER_VERSION = 'anilist-v1';
const AUTHORIZE = 'https://anilist.co/api/v2/oauth/authorize';
const TOKEN = 'https://anilist.co/api/v2/oauth/token';
const API = 'https://graphql.anilist.co';
const PER_CHUNK = 500;
const MAX_CHUNKS = 10;

export const ANILIST_MANIFEST: ProfileSourceManifest = {
  key: 'anilist',
  name: 'AniList',
  categories: ['series', 'movies', 'books'],
  authentication: 'oauth2',
  syncStrategy: 'scheduled',
  capabilities: { known: true, consumed: true, explicitRating: true, implicitPreference: false, history: false, incrementalSync: false },
  availability: 'available',
  simulated: false,
  description: 'Tu anime y manga en AniList: puntuaciones, favoritos, vistos, leídos y pendientes. Solo lectura.',
};

const STATUSES = ['CURRENT', 'PLANNING', 'COMPLETED', 'DROPPED', 'PAUSED', 'REPEATING'] as const;
const entrySchema = z.object({
  status: z.enum(STATUSES).nullable().optional(),
  score: z.number().nullable().optional(),
  repeat: z.number().nullable().optional(),
  updatedAt: z.number().nullable().optional(),
  completedAt: z.object({ year: z.number().nullable().optional(), month: z.number().nullable().optional(), day: z.number().nullable().optional() }).nullable().optional(),
  media: z
    .object({
      id: z.number(),
      idMal: z.number().nullable().optional(),
      type: z.enum(['ANIME', 'MANGA']).nullable().optional(),
      format: z.string().nullable().optional(),
      isFavourite: z.boolean().nullable().optional(),
      title: z.object({ romaji: z.string().nullable().optional(), english: z.string().nullable().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
});
const collectionSchema = z.object({
  data: z.object({
    MediaListCollection: z
      .object({ hasNextChunk: z.boolean().nullable().optional(), lists: z.array(z.object({ entries: z.array(entrySchema).nullable().optional() })).nullable().optional() })
      .nullable(),
  }),
});
const viewerSchema = z.object({ data: z.object({ Viewer: z.object({ id: z.number() }) }) });
const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number().optional() });

type Entry = z.infer<typeof entrySchema>;
export type AniListKind = 'anime' | 'manga';
export type AniListStatus = (typeof STATUSES)[number];

export interface AniListItem {
  kind: AniListKind;
  anilistId: number;
  malId?: number;
  format?: string;
  title: string;
  /** Puntuación 1–100 (0 o ausente = sin puntuar). */
  score: number | null;
  status: AniListStatus | null;
  favorite: boolean;
  date?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Una entrada por obra (AniList no repite una obra en varias listas del mismo tipo). */
export function collectAniList(kind: AniListKind, entries: Entry[]): AniListItem[] {
  const byId = new Map<number, AniListItem>();
  for (const e of entries) {
    const media = e.media;
    const title = media?.title?.english || media?.title?.romaji;
    if (!media || !title || byId.has(media.id)) continue;
    const c = e.completedAt;
    const date = c?.year && c.month && c.day ? `${c.year}-${pad(c.month)}-${pad(c.day)}T00:00:00Z` : e.updatedAt ? new Date(e.updatedAt * 1000).toISOString() : undefined;
    byId.set(media.id, {
      kind,
      anilistId: media.id,
      ...(media.idMal ? { malId: media.idMal } : {}),
      ...(media.format ? { format: media.format } : {}),
      title,
      score: typeof e.score === 'number' && e.score >= 1 && e.score <= 100 ? e.score : null,
      status: e.status ?? null,
      favorite: media.isFavourite === true,
      ...(date ? { date } : {}),
    });
  }
  return [...byId.values()];
}

/** Categoría que se espera de una obra de AniList: anime película → cine; resto del anime → series; manga → libros. */
export function aniListCategories(item: Pick<AniListItem, 'kind' | 'format'>): Category[] {
  if (item.kind === 'manga') return ['books'];
  return item.format === 'MOVIE' ? ['movies'] : ['series'];
}

interface AniListRecord {
  recordId: string;
  item: AniListItem;
  identified: IdentifiedEntity;
}

/**
 * Normalización (`anilist-v1`, propuesta sin calibrar):
 * - Puntuación 1–100: explícita, (s − 1) / 99 · 2 − 1; consumido.
 * - Favorito sin puntuación: me gusta +0,8.
 * - Visto/leído, en curso, en pausa o abandonado: consumido, preferencia NULL (abandonar no se trata como rechazo
 *   explícito: AniList no dice por qué).
 * - Planeado: conocido, no consumido, NULL.
 */
export function mapAniList(raw: unknown, context: NormalizeContext): NormalizedObservation[] {
  const { recordId, item, identified } = raw as AniListRecord;
  const id = identified.confidence;
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  const consumed = item.score !== null || item.favorite || (item.status !== null && item.status !== 'PLANNING');
  const base = {
    userId: context.userId,
    source: 'anilist' as const,
    sourceRecordId: recordId,
    observationKind: 'anilist_media',
    mapperVersion: ANILIST_MAPPER_VERSION,
    category: identified.category,
    externalItem: {
      sourceId: recordId,
      itemType: identified.itemType,
      title: identified.title,
      canonicalIds: { ...identified.canonicalIds, [`anilist:${item.kind}`]: String(item.anilistId) },
      ...(identified.releaseYear ? { attributes: { releaseYear: identified.releaseYear } } : {}),
    },
    ...(item.date ? { occurredAt: item.date, timestampPrecision: item.date.endsWith('T00:00:00Z') ? ('day' as const) : ('instant' as const) } : {}),
    knownConfidence: round(id),
    consumedConfidence: consumed ? round(id) : 0,
    metadata: { snapshot: true, status: item.status, favorite: item.favorite, identification: { method: identified.method, confidence: id } },
  };
  if (item.score !== null) {
    return [
      {
        ...base,
        preferenceScore: normalizeRating(item.score, { min: 1, max: 100, step: 1 }),
        preferenceConfidence: round(id),
        preferenceBasis: 'explicit_rating',
        engagement: { type: 'rating', value: item.score, unit: 'points_1_100' },
      },
    ];
  }
  if (item.favorite) {
    return [{ ...base, preferenceScore: 0.8, preferenceConfidence: round(0.9 * id), preferenceBasis: 'explicit_like', engagement: { type: 'liked', value: 1 } }];
  }
  const completed = item.status === 'COMPLETED' || item.status === 'REPEATING';
  return [
    {
      ...base,
      preferenceScore: null,
      preferenceConfidence: null,
      preferenceBasis: null,
      engagement: completed ? { type: 'completed', value: 1 } : consumed ? { type: 'played', unit: item.status?.toLowerCase() ?? 'started' } : { type: 'saved', unit: 'planning' },
    },
  ];
}

export interface AniListOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Solo el worker (sync). */
  identifier?: EntityIdentifier;
  fetchImpl?: typeof fetch;
}

const COLLECTION_QUERY = `query ($userId: Int, $type: MediaType, $chunk: Int, $perChunk: Int) {
  MediaListCollection(userId: $userId, type: $type, chunk: $chunk, perChunk: $perChunk) {
    hasNextChunk
    lists { entries { status score(format: POINT_100) repeat updatedAt completedAt { year month day }
      media { id idMal type format isFavourite title { romaji english } } } }
  }
}`;

export function createAniListAdapter(options: AniListOptions): ProfileSourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function graphql(accessToken: string, query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
    const response = await fetchImpl(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 400 || response.status === 401) {
      const body = (await response.json().catch(() => ({}))) as { errors?: Array<{ message?: string; status?: number }> };
      if (response.status === 401 || body.errors?.some((e) => e.status === 401 || /invalid token|unauthori[sz]ed/i.test(e.message ?? ''))) {
        throw new SourceError('auth', 'El permiso de AniList ha caducado o se ha revocado: vuelve a conectarlo', false);
      }
      throw new SourceError('bad_response', 'AniList rechazó la consulta', false);
    }
    if (response.status === 429 || response.status >= 500) throw new SourceError('unavailable', `AniList respondió HTTP ${response.status}`, true);
    if (!response.ok) throw new SourceError('bad_response', `AniList respondió HTTP ${response.status}`, false);
    return response.json();
  }

  async function collection(accessToken: string, userId: number, type: 'ANIME' | 'MANGA'): Promise<Entry[]> {
    const out: Entry[] = [];
    for (let chunk = 1; chunk <= MAX_CHUNKS; chunk++) {
      const parsed = collectionSchema.parse(await graphql(accessToken, COLLECTION_QUERY, { userId, type, chunk, perChunk: PER_CHUNK }));
      const c = parsed.data.MediaListCollection;
      for (const list of c?.lists ?? []) out.push(...(list.entries ?? []));
      if (!c?.hasNextChunk) break;
    }
    return out;
  }

  return {
    manifest: ANILIST_MANIFEST,
    supportsRenewal: true,
    snapshotObservationKinds: ['anilist_media'],
    async connect(context): Promise<AuthResult> {
      if (!context.state) throw new SourceError('not_configured', 'Falta el state del flujo de autorización', false);
      const url = new URL(AUTHORIZE);
      url.searchParams.set('client_id', options.clientId);
      url.searchParams.set('redirect_uri', options.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', context.state);
      return { kind: 'redirect', url: url.toString(), state: context.state, pending: {} };
    },
    async completeConnect(context): Promise<AuthResult> {
      const params = context.callbackParams;
      if (params.error) throw new SourceError('verification_failed', params.error === 'access_denied' ? 'Se canceló la autorización en AniList' : 'AniList no concedió el acceso', false);
      if (!params.code) throw new SourceError('verification_failed', 'Respuesta de AniList incompleta: vuelve a intentarlo', false);
      const response = await fetchImpl(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', client_id: options.clientId, client_secret: options.clientSecret, redirect_uri: options.redirectUri, code: params.code }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new SourceError('verification_failed', `AniList no aceptó el código (HTTP ${response.status}): vuelve a intentarlo`, false);
      const t = tokenSchema.parse(await response.json());
      const expiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : undefined;
      return { kind: 'connected', credentials: { accessToken: t.access_token, ...(expiresAt ? { accessTokenExpiresAt: expiresAt } : {}) }, scopes: [] };
    },
    async sync(context: SyncContext): Promise<SyncBatch> {
      const identifier = options.identifier;
      if (!identifier) throw new SourceError('not_configured', 'Falta el identificador de catálogo para AniList', false);
      const accessToken = context.credentials?.accessToken;
      if (!accessToken) throw new SourceError('verification_failed', 'La conexión con AniList está incompleta: vuelve a conectarla', false);
      const viewer = viewerSchema.parse(await graphql(accessToken, 'query { Viewer { id } }'));
      const userId = viewer.data.Viewer.id;
      const items = [
        ...collectAniList('anime', await collection(accessToken, userId, 'ANIME')),
        ...collectAniList('manga', await collection(accessToken, userId, 'MANGA')),
      ];
      const records: AniListRecord[] = [];
      let unidentified = 0;
      try {
        const found = identifier.identifyByExternalIds
          ? await identifier.identifyByExternalIds(items.map((i) => ({ anilist: i.anilistId, ...(i.malId ? { mal: i.malId } : {}), kind: i.kind })))
          : items.map(() => null);
        for (const [i, item] of items.entries()) {
          const categories = aniListCategories(item);
          const entity = found[i] ?? (await identifier.identifyWork({ title: item.title, languages: ['en', 'ja', 'es'], categories }));
          if (entity) records.push({ recordId: `${item.kind}:${item.anilistId}`, item, identified: entity });
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
        partialErrors: unidentified ? [{ code: 'unidentified', message: `${unidentified} de ${items.length} obras de AniList no se pudieron identificar con seguridad`, blocking: false }] : [],
        snapshotComplete: true,
        snapshotKinds: ['anilist_media'],
        stats: { anilist_exported: items.length, anilist_identified: records.length },
      };
    },
    normalize: async (record, context) => mapAniList(record, context),
    // AniList no ofrece revocación por API: se borran las credenciales y el usuario puede retirar el permiso en su
    // cuenta (Settings → Apps).
    async disconnect() {},
  };
}
