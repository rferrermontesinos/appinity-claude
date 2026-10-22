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
 * Google Books (fase 11): estanterías del usuario con la API oficial (developers.google.com/books/docs/v1/using,
 * consultada el 2026-10-15). Scope `https://www.googleapis.com/auth/books`. Gratuita.
 * - En producción se pide junto con «Continuar con Google» (mismo consentimiento del alta). Para cuentas ya creadas,
 *   conexión normal con su propia URL de vuelta.
 * - Estanterías usadas: Favoritos (0), Comprados (1), Por leer (2), Leyendo (3), Leídos (4), Reseñados (5) y Mis
 *   eBooks (7). No se usan «Vistos recientemente», «Libros para ti» ni el historial (6, 8, 9): no son gustos.
 * - Identificación: ID de Google Books en Wikidata (P675, exacto) y, si no está, título exacto limitado a libros.
 */
export const GOOGLE_BOOKS_SCOPE = 'https://www.googleapis.com/auth/books';
export const GOOGLE_BOOKS_MAPPER_VERSION = 'google-books-v1';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/books/v1';
const PAGE = 40;
const MAX_PER_SHELF = 400;

export const SHELVES = {
  0: 'favorites',
  1: 'purchased',
  2: 'to_read',
  3: 'reading_now',
  4: 'have_read',
  5: 'reviewed',
  7: 'my_ebooks',
} as const;
export type ShelfKind = (typeof SHELVES)[keyof typeof SHELVES];

export const GOOGLE_BOOKS_MANIFEST: ProfileSourceManifest = {
  key: 'google_books',
  name: 'Google Books',
  categories: ['books'],
  authentication: 'oauth2',
  syncStrategy: 'scheduled',
  capabilities: { known: true, consumed: true, explicitRating: true, implicitPreference: false, history: false, incrementalSync: false },
  availability: 'available',
  simulated: false,
  description: 'Tus estanterías de Google Books: favoritos, leídos, reseñados con estrellas, por leer y comprados. Solo lectura.',
};

const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional(), scope: z.string().optional() });
const volumesSchema = z.object({
  totalItems: z.number().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        volumeInfo: z
          .object({
            title: z.string().optional(),
            authors: z.array(z.string()).optional(),
            publishedDate: z.string().optional(),
            industryIdentifiers: z.array(z.object({ type: z.string(), identifier: z.string() })).optional(),
          })
          .optional(),
        userInfo: z
          .object({
            review: z.object({ rating: z.union([z.string(), z.number()]).optional() }).passthrough().optional(),
            updated: z.string().optional(),
          })
          .passthrough()
          .optional(),
      }),
    )
    .optional(),
});

export interface BookRecord {
  volumeId: string;
  title: string;
  authors: string[];
  isbn13?: string;
  /** Estanterías en las que está (un libro puede estar en varias). */
  shelves: ShelfKind[];
  /** Estrellas 1–5 de la reseña del usuario, si la hay. */
  rating: number | null;
  updated?: string;
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export function parseReviewRating(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  if (!value) return null;
  return STARS[value.toUpperCase()] ?? (/^[1-5]$/.test(value) ? Number(value) : null);
}

export interface GoogleBooksOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Solo lo necesita el worker (sync); la API únicamente conecta y desconecta. */
  identifier?: EntityIdentifier;
  fetchImpl?: typeof fetch;
}

export class GoogleBooksClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: Omit<GoogleBooksOptions, 'identifier'>) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  authorizeUrl(state: string, codeChallenge: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', this.options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_BOOKS_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async token(params: Record<string, string>): Promise<z.infer<typeof tokenSchema>> {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.options.clientId, client_secret: this.options.clientSecret, ...params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 400 || response.status === 401) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new SourceError('auth', data.error === 'invalid_grant' ? 'El permiso de Google Books ha caducado o se ha revocado: vuelve a conectarlo' : 'Google rechazó la autorización', false);
    }
    if (!response.ok) throw new SourceError('unavailable', `Google respondió HTTP ${response.status}`, response.status >= 500);
    return tokenSchema.parse(await response.json());
  }

  async revoke(token: string): Promise<void> {
    await this.fetchImpl(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
  }

  /** Volúmenes de una estantería, paginados (como mucho MAX_PER_SHELF). */
  async shelf(accessToken: string, shelfId: number): Promise<z.infer<typeof volumesSchema>['items']> {
    const items: NonNullable<z.infer<typeof volumesSchema>['items']> = [];
    for (let start = 0; start < MAX_PER_SHELF; start += PAGE) {
      const url = `${API}/mylibrary/bookshelves/${shelfId}/volumes?maxResults=${PAGE}&startIndex=${start}`;
      const response = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 401) throw new SourceError('auth', 'El permiso de Google Books ya no es válido: vuelve a conectarlo', false);
      if (response.status === 429 || response.status >= 500) throw new SourceError('unavailable', `Google Books respondió HTTP ${response.status}`, true);
      if (!response.ok) throw new SourceError('bad_response', `Google Books respondió HTTP ${response.status}`, false);
      const page = volumesSchema.parse(await response.json());
      items.push(...(page.items ?? []));
      if (!page.items?.length || page.items.length < PAGE) break;
    }
    return items;
  }
}

/** Une las estanterías por volumen (un libro puede estar en Favoritos y en Leídos a la vez). */
export function collectBooks(shelves: Array<{ kind: ShelfKind; items: z.infer<typeof volumesSchema>['items'] }>): BookRecord[] {
  const byId = new Map<string, BookRecord>();
  for (const { kind, items } of shelves) {
    for (const item of items ?? []) {
      const title = item.volumeInfo?.title?.trim();
      if (!title) continue;
      const current = byId.get(item.id) ?? {
        volumeId: item.id,
        title,
        authors: item.volumeInfo?.authors ?? [],
        ...(() => {
          const isbn = item.volumeInfo?.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;
          return isbn ? { isbn13: isbn } : {};
        })(),
        shelves: [] as ShelfKind[],
        rating: null as number | null,
      };
      if (!current.shelves.includes(kind)) current.shelves.push(kind);
      const rating = parseReviewRating(item.userInfo?.review?.rating);
      if (rating !== null) current.rating = rating;
      if (item.userInfo?.updated && (!current.updated || item.userInfo.updated > current.updated)) current.updated = item.userInfo.updated;
      byId.set(item.id, current);
    }
  }
  return [...byId.values()];
}

interface BooksRecord {
  recordId: string;
  book: BookRecord;
  identified: IdentifiedEntity;
}

/**
 * Normalización (`google-books-v1`, propuesta sin calibrar):
 * - Reseña con estrellas: valoración explícita (r − 3) / 2, consumido.
 * - Favoritos: me gusta explícito +0,8 (confianza 0,9).
 * - Leídos, Leyendo o Reseñados sin estrellas: consumido, preferencia NULL.
 * - Por leer, Comprados y Mis eBooks: conocido, no consumido, preferencia NULL (comprar o querer leer no prueba gusto).
 */
export function mapBook(raw: unknown, context: NormalizeContext): NormalizedObservation[] {
  const { recordId, book, identified } = raw as BooksRecord;
  const id = identified.confidence;
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  const consumed = book.rating !== null || book.shelves.some((s) => s === 'have_read' || s === 'reading_now' || s === 'reviewed');
  const base = {
    userId: context.userId,
    source: 'google_books' as const,
    sourceRecordId: recordId,
    observationKind: 'gbooks_shelf',
    mapperVersion: GOOGLE_BOOKS_MAPPER_VERSION,
    category: identified.category,
    externalItem: {
      sourceId: recordId,
      itemType: identified.itemType,
      title: identified.title,
      canonicalIds: { ...identified.canonicalIds, 'google_books:volume': book.volumeId, ...(book.isbn13 ? { isbn13: book.isbn13 } : {}) },
      ...(identified.releaseYear ? { attributes: { releaseYear: identified.releaseYear } } : {}),
    },
    ...(book.updated ? { occurredAt: book.updated, timestampPrecision: 'instant' as const } : {}),
    knownConfidence: round(id),
    consumedConfidence: consumed ? round(id) : 0,
    metadata: { snapshot: true, shelves: book.shelves, identification: { method: identified.method, confidence: identified.confidence } },
  };
  if (book.rating !== null) {
    return [
      {
        ...base,
        preferenceScore: normalizeRating(book.rating, { min: 1, max: 5, step: 1 }),
        preferenceConfidence: round(id),
        preferenceBasis: 'explicit_rating',
        engagement: { type: 'rating', value: book.rating, unit: 'stars_1_5' },
      },
    ];
  }
  if (book.shelves.includes('favorites')) {
    return [{ ...base, preferenceScore: 0.8, preferenceConfidence: round(0.9 * id), preferenceBasis: 'explicit_like', engagement: { type: 'liked', value: 1 } }];
  }
  return [
    {
      ...base,
      preferenceScore: null,
      preferenceConfidence: null,
      preferenceBasis: null,
      engagement: consumed ? { type: 'completed' } : { type: book.shelves.includes('to_read') ? 'saved' : 'owned' },
    },
  ];
}

const pkce = () => {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

export function createGoogleBooksAdapter(options: GoogleBooksOptions): ProfileSourceAdapter {
  const client = new GoogleBooksClient(options);
  const accessToken = async (credentials: Record<string, string> | undefined): Promise<string> => {
    if (credentials?.refreshToken) return (await client.token({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken })).access_token;
    const expires = Date.parse(credentials?.accessTokenExpiresAt ?? '');
    if (credentials?.accessToken && expires - Date.now() > 60_000) return credentials.accessToken;
    throw new SourceError('verification_failed', 'El acceso a Google Books ha caducado: vuelve a conectarlo', false);
  };
  return {
    manifest: GOOGLE_BOOKS_MANIFEST,
    requestedScopes: [GOOGLE_BOOKS_SCOPE],
    supportsRenewal: true,
    snapshotObservationKinds: ['gbooks_shelf'],
    async connect(context): Promise<AuthResult> {
      if (!context.state) throw new SourceError('not_configured', 'Falta el state del flujo de autorización', false);
      const { verifier, challenge } = pkce();
      return {
        kind: 'redirect',
        url: client.authorizeUrl(context.state, challenge),
        state: context.state,
        pending: { codeVerifier: verifier },
        ...(/^http:\/\/(localhost|127\.0\.0\.1)/.test(options.redirectUri) ? { localOnly: true } : {}),
      };
    },
    async completeConnect(context): Promise<AuthResult> {
      const params = context.callbackParams;
      if (params.error) throw new SourceError('verification_failed', params.error === 'access_denied' ? 'Se canceló la autorización en Google' : 'Google no concedió el acceso', false);
      const verifier = context.pending?.codeVerifier;
      if (!params.code || !verifier) throw new SourceError('verification_failed', 'Respuesta de Google incompleta: vuelve a intentarlo', false);
      const token = await client.token({ grant_type: 'authorization_code', code: params.code, code_verifier: verifier, redirect_uri: options.redirectUri });
      return googleBooksConnection(token);
    },
    async sync(context: SyncContext): Promise<SyncBatch> {
      const identifier = options.identifier;
      if (!identifier) throw new SourceError('not_configured', 'Falta el identificador de catálogo para Google Books', false);
      const token = await accessToken(context.credentials);
      const shelves: Array<{ kind: ShelfKind; items: z.infer<typeof volumesSchema>['items'] }> = [];
      for (const [id, kind] of Object.entries(SHELVES)) shelves.push({ kind, items: await client.shelf(token, Number(id)) });
      const books = collectBooks(shelves);
      const records: BooksRecord[] = [];
      let unidentified = 0;
      try {
        for (const book of books) {
          const entity = await identifyBook(identifier, book);
          if (entity) records.push({ recordId: `volume:${book.volumeId}`, book, identified: entity });
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
        partialErrors: unidentified
          ? [{ code: 'unidentified', message: `${unidentified} de ${books.length} libros de Google Books no se pudieron identificar con seguridad`, blocking: false }]
          : [],
        snapshotComplete: true,
        snapshotKinds: ['gbooks_shelf'],
        stats: { gbooks_exported: books.length, gbooks_identified: records.length },
      };
    },
    normalize: async (record, context) => mapBook(record, context),
    async disconnect(_connection, credentials) {
      if (credentials?.sharedGrant) return;
      const token = credentials?.refreshToken ?? credentials?.accessToken;
      if (token) await client.revoke(token).catch(() => undefined);
    },
  };
}

/** Credenciales de una conexión de Google Books a partir de la respuesta de token (también desde el inicio de sesión). */
/**
 * `shared`: el permiso viene de «Continuar con Google» y lo comparten el inicio de sesión y otras fuentes de Google; al
 * desconectar no se revoca (revocarlo las cortaría todas).
 */
export function googleBooksConnection(token: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }, options: { shared?: boolean } = {}): AuthResult {
  if (token.scope && !token.scope.split(' ').includes(GOOGLE_BOOKS_SCOPE)) {
    throw new SourceError('verification_failed', 'No se concedió el permiso de Google Books', false);
  }
  const credentials: Record<string, string> = token.refresh_token
    ? { refreshToken: token.refresh_token }
    : { accessToken: token.access_token, accessTokenExpiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString() };
  return { kind: 'connected', credentials: options.shared ? { ...credentials, sharedGrant: '1' } : credentials, scopes: [GOOGLE_BOOKS_SCOPE] };
}

/** ID de Google Books en Wikidata (P675) y, si no, título exacto limitado a libros. */
async function identifyBook(identifier: EntityIdentifier, book: BookRecord): Promise<IdentifiedEntity | null> {
  const byId = identifier.identifyGoogleBooksVolume ? await identifier.identifyGoogleBooksVolume(book.volumeId) : null;
  // Sin etiqueta en español o inglés en Wikidata, el título sería el QID: se usa el de Google Books.
  if (byId) return /^Q\d+$/.test(byId.title) ? { ...byId, title: book.title } : byId;
  return identifier.identifyWork({ title: book.title, languages: ['es', 'en'], categories: ['books'] });
}
