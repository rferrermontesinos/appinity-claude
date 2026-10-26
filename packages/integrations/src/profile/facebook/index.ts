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
 * Facebook (páginas que te gustan). Documentación oficial consultada el 2026-10-26:
 * - Inicio de sesión con Facebook (OAuth 2, «authorization code») con el permiso `user_likes`. Uso permitido por Meta:
 *   «personalizar la experiencia relacionando o mostrando contenido sobre los gustos de la persona»
 *   (developers.facebook.com/docs/permissions). En modo desarrollo lo pueden usar las cuentas con rol en la app; en
 *   producción exige App Review y verificación del negocio.
 * - Graph API `/me/likes`: páginas con nombre, usuario, categoría, ubicación y fecha del «me gusta».
 * - El token de corta duración se cambia por uno de 60 días; sin refresh token: al caducar, se vuelve a conectar.
 * Identificación: exacta por la cuenta de Facebook en Wikidata (P2013); si no, según el tipo de página (restaurante con
 * ubicación → OpenStreetMap; programa de TV, película, libro, grupo, podcast o videojuego → título en esa categoría).
 * Marcas, personas públicas y empresas no son obras ni lugares del catálogo: se ignoran.
 */
export const FACEBOOK_MAPPER_VERSION = 'facebook-v1';
const MAX_PAGES = 20;

export const FACEBOOK_MANIFEST: ProfileSourceManifest = {
  key: 'facebook',
  name: 'Facebook',
  categories: ['food', 'culture', 'movies', 'series', 'music', 'books', 'podcasts', 'games'],
  authentication: 'oauth2',
  syncStrategy: 'scheduled',
  capabilities: { known: true, consumed: false, explicitRating: false, implicitPreference: true, history: false, incrementalSync: false },
  availability: 'available',
  simulated: false,
  description: 'Las páginas que te gustan en Facebook: restaurantes, series, películas, grupos, libros, podcasts y juegos. Solo lectura.',
};

const likeSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  category_list: z.array(z.object({ name: z.string().nullable().optional() })).nullable().optional(),
  location: z
    .object({ latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional(), country: z.string().nullable().optional() })
    .nullable()
    .optional(),
  created_time: z.string().nullable().optional(),
});
const likesPageSchema = z.object({ data: z.array(likeSchema).default([]), paging: z.object({ next: z.string().optional() }).optional() });
const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number().optional() });

export type FacebookLike = z.infer<typeof likeSchema>;

/** Qué representa una página según sus categorías de Facebook (en inglés en la API). `null` = no es del catálogo. */
export type FacebookPageKind = { kind: 'place'; category: 'food' | 'culture' } | { kind: 'work'; categories: Category[] } | { kind: 'artist' };

const PLACE_FOOD = /\b(restaurant|caf[eé]|coffee|bar|pub|bakery|bistro|brewery|winery|tapas|pizza|sushi|food|diner|steakhouse|gastropub)\b/i;
const PLACE_CULTURE = /\b(museum|art gallery|theat(er|re)|concert venue|cinema|movie theat(er|re)|library|landmark|historical place|monument)\b/i;
const WORK_KINDS: Array<[RegExp, Category[]]> = [
  [/\btv (show|series|program|network)?\b|\btv\b/i, ['series']],
  [/\bmovie\b|\bfilm\b/i, ['movies']],
  [/\bbook( series)?\b|\bauthor\b|\bwriter\b/i, ['books']],
  [/\bpodcast\b|\bradio (show|station)\b/i, ['podcasts']],
  [/\bvideo game\b|\bgames?\/toys\b|\bgaming\b/i, ['games']],
];
const ARTIST = /\b(musician|band|artist|singer|dj|orchestra|composer|record label)\b/i;

export function facebookPageKind(like: Pick<FacebookLike, 'category' | 'category_list' | 'location'>): FacebookPageKind | null {
  const names = [like.category, ...(like.category_list ?? []).map((c) => c.name)].filter((n): n is string => Boolean(n));
  const text = names.join(' | ');
  const located = typeof like.location?.latitude === 'number' && typeof like.location?.longitude === 'number';
  if (located && PLACE_FOOD.test(text)) return { kind: 'place', category: 'food' };
  if (located && PLACE_CULTURE.test(text)) return { kind: 'place', category: 'culture' };
  if (ARTIST.test(text)) return { kind: 'artist' };
  for (const [pattern, categories] of WORK_KINDS) if (pattern.test(text)) return { kind: 'work', categories };
  return null;
}

interface FacebookRecord {
  recordId: string;
  like: FacebookLike;
  identified: IdentifiedEntity;
}

/** Años desde el «me gusta» (los antiguos pesan menos: el gusto puede haber cambiado). */
const yearsSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / (365.25 * 24 * 3600 * 1000) : null);

/**
 * Normalización (`facebook-v1`, propuesta sin calibrar):
 * - «Me gusta» de una página: gusto explícito pero débil (+0,6), confianza 0,6 × identificación; ×0,7 si tiene más
 *   de 5 años. Conocido = identificación.
 * - No implica haberlo visto, leído o visitado: consumido 0. Nunca un disgusto (no gustar no es rechazo).
 */
export function mapFacebook(raw: unknown, context: NormalizeContext, now = new Date()): NormalizedObservation[] {
  const { recordId, like, identified } = raw as FacebookRecord;
  const id = identified.confidence;
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  const age = yearsSince(like.created_time, now);
  const ageFactor = age !== null && age > 5 ? 0.7 : 1;
  const date = like.created_time ? new Date(like.created_time) : null;
  return [
    {
      userId: context.userId,
      source: 'facebook',
      sourceRecordId: recordId,
      observationKind: 'fb_page_like',
      mapperVersion: FACEBOOK_MAPPER_VERSION,
      category: identified.category,
      externalItem: {
        sourceId: recordId,
        itemType: identified.itemType,
        title: identified.title,
        canonicalIds: { ...identified.canonicalIds, 'facebook:page': like.id },
        ...(identified.releaseYear ? { attributes: { releaseYear: identified.releaseYear } } : {}),
        ...(identified.location ? { location: identified.location } : {}),
      },
      ...(date && !Number.isNaN(date.getTime()) ? { occurredAt: date.toISOString(), timestampPrecision: 'instant' as const } : {}),
      knownConfidence: round(id),
      consumedConfidence: 0,
      preferenceScore: 0.6,
      preferenceConfidence: round(0.6 * id * ageFactor),
      preferenceBasis: 'explicit_like',
      engagement: { type: 'liked', value: 1 },
      metadata: { snapshot: true, pageCategory: like.category ?? null, identification: { method: identified.method, confidence: id } },
    },
  ];
}

export interface FacebookOptions {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Versión de la Graph API (p. ej. v23.0). */
  graphVersion?: string;
  /** Solo el worker (sync). */
  identifier?: EntityIdentifier;
  fetchImpl?: typeof fetch;
}

export function createFacebookAdapter(options: FacebookOptions): ProfileSourceAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const version = options.graphVersion ?? 'v23.0';
  const graph = `https://graph.facebook.com/${version}`;

  async function get(url: string): Promise<unknown> {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      const body = (await response.json().catch(() => ({}))) as { error?: { code?: number; type?: string; message?: string } };
      // 190: token caducado o revocado; 200–299: permiso retirado.
      if (body.error?.code === 190 || (body.error?.code ?? 0) >= 200 || body.error?.type === 'OAuthException') {
        throw new SourceError('auth', 'El permiso de Facebook ha caducado o se ha retirado: vuelve a conectarlo', false);
      }
      throw new SourceError('bad_response', 'Facebook rechazó la consulta', false);
    }
    if (response.status === 429 || response.status >= 500) throw new SourceError('unavailable', `Facebook respondió HTTP ${response.status}`, true);
    if (!response.ok) throw new SourceError('bad_response', `Facebook respondió HTTP ${response.status}`, false);
    return response.json();
  }

  async function likes(accessToken: string): Promise<FacebookLike[]> {
    const out: FacebookLike[] = [];
    const first = new URL(`${graph}/me/likes`);
    first.searchParams.set('fields', 'id,name,username,category,category_list{name},location{latitude,longitude,country},created_time');
    first.searchParams.set('limit', '100');
    first.searchParams.set('access_token', accessToken);
    let next: string | undefined = first.toString();
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const parsed = likesPageSchema.parse(await get(next));
      out.push(...parsed.data);
      next = parsed.paging?.next;
    }
    return out;
  }

  return {
    manifest: FACEBOOK_MANIFEST,
    supportsRenewal: true,
    snapshotObservationKinds: ['fb_page_like'],
    async connect(context): Promise<AuthResult> {
      if (!context.state) throw new SourceError('not_configured', 'Falta el state del flujo de autorización', false);
      const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
      url.searchParams.set('client_id', options.appId);
      url.searchParams.set('redirect_uri', options.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'user_likes');
      url.searchParams.set('state', context.state);
      return { kind: 'redirect', url: url.toString(), state: context.state, pending: {} };
    },
    async completeConnect(context): Promise<AuthResult> {
      const params = context.callbackParams;
      if (params.error) throw new SourceError('verification_failed', params.error === 'access_denied' ? 'Se canceló la autorización en Facebook' : 'Facebook no concedió el acceso', false);
      if (!params.code) throw new SourceError('verification_failed', 'Respuesta de Facebook incompleta: vuelve a intentarlo', false);
      const exchange = new URL(`${graph}/oauth/access_token`);
      exchange.searchParams.set('client_id', options.appId);
      exchange.searchParams.set('client_secret', options.appSecret);
      exchange.searchParams.set('redirect_uri', options.redirectUri);
      exchange.searchParams.set('code', params.code);
      const short = await fetchImpl(exchange, { signal: AbortSignal.timeout(15_000) });
      if (!short.ok) throw new SourceError('verification_failed', `Facebook no aceptó el código (HTTP ${short.status}): vuelve a intentarlo`, false);
      const shortToken = tokenSchema.parse(await short.json());
      // Token de larga duración (60 días).
      const longUrl = new URL(`${graph}/oauth/access_token`);
      longUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longUrl.searchParams.set('client_id', options.appId);
      longUrl.searchParams.set('client_secret', options.appSecret);
      longUrl.searchParams.set('fb_exchange_token', shortToken.access_token);
      const long = await fetchImpl(longUrl, { signal: AbortSignal.timeout(15_000) });
      const token = long.ok ? tokenSchema.parse(await long.json()) : shortToken;
      // Comprobar que se concedió `user_likes` (en Facebook se puede desmarcar en el diálogo).
      const permissions = (await get(`${graph}/me/permissions?access_token=${encodeURIComponent(token.access_token)}`)) as { data?: Array<{ permission: string; status: string }> };
      if (!permissions.data?.some((p) => p.permission === 'user_likes' && p.status === 'granted')) {
        throw new SourceError('verification_failed', 'No se concedió el permiso de páginas que te gustan: vuelve a conectar y déjalo marcado', false);
      }
      const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined;
      return { kind: 'connected', credentials: { accessToken: token.access_token, ...(expiresAt ? { accessTokenExpiresAt: expiresAt } : {}) }, scopes: ['user_likes'] };
    },
    async sync(context: SyncContext): Promise<SyncBatch> {
      const identifier = options.identifier;
      if (!identifier) throw new SourceError('not_configured', 'Falta el identificador de catálogo para Facebook', false);
      const accessToken = context.credentials?.accessToken;
      if (!accessToken) throw new SourceError('verification_failed', 'La conexión con Facebook está incompleta: vuelve a conectarla', false);
      const all = await likes(accessToken);
      const candidates = all.map((like) => ({ like, kind: facebookPageKind(like) }));
      const records: FacebookRecord[] = [];
      let unidentified = 0;
      let ignored = 0;
      try {
        // 1) Exacta: la cuenta de Facebook en Wikidata (P2013), para cualquier página.
        const exact = identifier.identifyByExternalIds
          ? await identifier.identifyByExternalIds(all.map((l) => ({ facebook: l.username ?? l.id, kind: 'social' as const })))
          : all.map(() => null);
        for (const [i, { like, kind }] of candidates.entries()) {
          let entity: IdentifiedEntity | null = exact[i] ?? null;
          if (!entity && kind) {
            if (kind.kind === 'place') {
              // OpenStreetMap decide si es restaurante o lugar cultural por el tipo del elemento.
              entity = await identifier.identifyPlace({ name: like.name, latitude: like.location!.latitude!, longitude: like.location!.longitude! });
            } else if (kind.kind === 'artist') {
              entity = (await identifier.identifyArtists([like.name]))[0]?.entity ?? null;
            } else {
              entity = await identifier.identifyWork({ title: like.name, languages: ['es', 'en'], categories: kind.categories });
            }
          }
          if (entity) records.push({ recordId: `page:${like.id}`, like, identified: entity });
          else if (kind) unidentified++;
          else ignored++;
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
        partialErrors: unidentified ? [{ code: 'unidentified', message: `${unidentified} páginas de Facebook no se pudieron identificar con seguridad`, blocking: false }] : [],
        snapshotComplete: true,
        snapshotKinds: ['fb_page_like'],
        stats: { facebook_likes: all.length, facebook_identified: records.length, facebook_ignored: ignored },
      };
    },
    normalize: async (record, context) => mapFacebook(record, context),
    // Al desconectar se retira el permiso en Facebook (DELETE /me/permissions); si falla, el usuario puede quitar la app
    // en Configuración → Apps y sitios web.
    async disconnect(_connection, credentials) {
      const accessToken = credentials?.accessToken;
      if (!accessToken) return;
      await fetchImpl(`${graph}/me/permissions?access_token=${encodeURIComponent(accessToken)}`, { method: 'DELETE', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
    },
  };
}
