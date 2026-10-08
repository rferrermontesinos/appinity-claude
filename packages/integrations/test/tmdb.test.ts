import { SourceError, parseObservation, type SyncContext } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { TmdbCatalogProvider } from '../src/catalog/tmdb.js';
import { PLANNED_MANIFESTS } from '../src/planned.js';
import { completeTmdbConnect, startTmdbConnect } from '../src/profile/tmdb/auth.js';
import {
  SIMULATED_TMDB_ACCOUNT_ID,
  SIMULATED_TMDB_READ_TOKEN,
  createFakeTmdbFetch,
  defaultLists,
  listItem,
} from '../src/profile/tmdb/fixtures/responses.js';
import { createTmdbAdapter } from '../src/profile/tmdb/index.js';
import { mapTmdbRecord } from '../src/profile/tmdb/mapper.js';
import { syncTmdb } from '../src/profile/tmdb/sync.js';
import { createAdapterRegistry } from '../src/registry.js';
import { TmdbClient } from '../src/tmdb/client.js';

const USER = '10000000-0000-4000-a000-0000000000bb';
const CONNECTION = '20000000-0000-4000-a000-000000000002';
const REDIRECT = 'http://192.168.1.16:3100/v1/connect/tmdb/callback/abcdefghijklmnopqrstuvwx';
const noSleep = async () => undefined;
const ctx = { userId: USER, connectionId: CONNECTION, source: 'tmdb' as const };

function client(fake = createFakeTmdbFetch()) {
  return new TmdbClient({ readToken: SIMULATED_TMDB_READ_TOKEN, fetchImpl: fake.fetchImpl, sleep: noSleep });
}

/** Recorre el flujo completo (token → aprobación → sesión) y devuelve la sesión simulada. */
async function authorize(fake: ReturnType<typeof createFakeTmdbFetch>) {
  const c = client(fake);
  const start = await startTmdbConnect(c, { userId: USER, redirectUri: REDIRECT });
  if (start.kind !== 'redirect') throw new Error('se esperaba redirección');
  fake.approve(start.pending!.requestToken!);
  const done = await completeTmdbConnect(c, {
    userId: USER,
    redirectUri: REDIRECT,
    callbackParams: { request_token: start.pending!.requestToken!, approved: 'true' },
    pending: start.pending!,
  });
  if (done.kind !== 'connected') throw new Error('se esperaba conexión');
  return done;
}

function syncContext(sessionId: string | undefined, accountRef = String(SIMULATED_TMDB_ACCOUNT_ID)): SyncContext {
  return {
    connection: { id: CONNECTION, userId: USER, sourceKey: 'tmdb', status: 'active', externalAccountRef: accountRef, cursor: null },
    ...(sessionId ? { credentials: { sessionId } } : {}),
    cursor: null,
    pageSize: 50,
    now: new Date('2026-10-08T12:00:00Z'),
  };
}

describe('autorización de TMDb (sesión de usuario, v3)', () => {
  it('pide un request token con el token de la app y manda al usuario a themoviedb.org con redirect_to', async () => {
    const fake = createFakeTmdbFetch();
    const start = await startTmdbConnect(client(fake), { userId: USER, redirectUri: REDIRECT });
    expect(start.kind).toBe('redirect');
    const url = new URL((start as { url: string }).url);
    expect(url.origin + url.pathname).toBe('https://www.themoviedb.org/authenticate/simulated-request-token-1');
    expect(url.searchParams.get('redirect_to')).toBe(REDIRECT);
    // El token viaja en `pending` (lo guarda la API con el state) y nunca hay sesión en la URL.
    expect((start as { pending: Record<string, string> }).pending).toEqual({ requestToken: 'simulated-request-token-1' });
    expect(url.searchParams.has('session_id')).toBe(false);
    expect(fake.calls[0]).toMatchObject({ path: '/3/authentication/token/new', authorization: `Bearer ${SIMULATED_TMDB_READ_TOKEN}` });
  });

  it('con el token aprobado crea la sesión, identifica la cuenta y devuelve la sesión como credencial', async () => {
    const fake = createFakeTmdbFetch();
    const done = await authorize(fake);
    expect(done).toMatchObject({ kind: 'connected', externalAccountRef: '90000001' });
    expect(done.credentials?.sessionId).toMatch(/^simulated-session-/);
    expect(done.scopes).toEqual(['tmdb:session', 'account:rated', 'account:favorite', 'account:watchlist']);
  });

  it('si /3/account no existe usa la forma documentada con id', async () => {
    const fake = createFakeTmdbFetch({ accountWithoutIdMissing: true });
    await expect(authorize(fake)).resolves.toMatchObject({ externalAccountRef: '90000001' });
    expect(fake.calls.map((c) => c.path)).toContain('/3/account/0');
  });

  it('rechaza un acceso denegado, un token que no es el del flujo o uno sin aprobar', async () => {
    const fake = createFakeTmdbFetch();
    const c = client(fake);
    const start = (await startTmdbConnect(c, { userId: USER, redirectUri: REDIRECT })) as { pending: Record<string, string> };
    const base = { userId: USER, redirectUri: REDIRECT, pending: start.pending };
    await expect(
      completeTmdbConnect(c, { ...base, callbackParams: { request_token: start.pending.requestToken!, denied: 'true' } }),
    ).rejects.toMatchObject({ code: 'verification_failed', message: expect.stringMatching(/denegó/) });
    await expect(
      completeTmdbConnect(c, { ...base, callbackParams: { request_token: 'otro-token-0123456789', approved: 'true' } }),
    ).rejects.toMatchObject({ code: 'verification_failed' });
    // Sin aprobar en TMDb: la creación de sesión responde 401 y no se confunde con un fallo del token de la app.
    await expect(
      completeTmdbConnect(c, { ...base, callbackParams: { request_token: start.pending.requestToken!, approved: 'true' } }),
    ).rejects.toMatchObject({ code: 'verification_failed', retryable: false });
    await expect(completeTmdbConnect(c, { userId: USER, redirectUri: REDIRECT, callbackParams: {} })).rejects.toBeInstanceOf(SourceError);
    expect(fake.sessions.size).toBe(0);
  });

  it('desconectar borra la sesión también en TMDb', async () => {
    const fake = createFakeTmdbFetch();
    const done = await authorize(fake);
    const adapter = createTmdbAdapter({ readToken: SIMULATED_TMDB_READ_TOKEN, fetchImpl: fake.fetchImpl, sleep: noSleep });
    const connection = { id: CONNECTION, userId: USER, sourceKey: 'tmdb' as const, status: 'revoked' as const, cursor: null };
    await adapter.disconnect(connection, done.credentials);
    expect(fake.deletedSessions).toEqual([done.credentials!.sessionId]);
    expect(fake.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/3/authentication/session', hasSession: false });
    await expect(adapter.disconnect(connection)).resolves.toBeUndefined();
  });
});

describe('cliente de TMDb', () => {
  it('reintenta 429 y 5xx con backoff', async () => {
    const fake = createFakeTmdbFetch({ failuresBeforeSuccess: [429, 503] });
    await expect(client(fake).createRequestToken()).resolves.toMatch(/^simulated-request-token-/);
    expect(fake.calls).toHaveLength(3);
  });

  it('agotados los reintentos, el límite es un error reintentable', async () => {
    const fake = createFakeTmdbFetch({ failuresBeforeSuccess: [429, 429, 429, 429] });
    await expect(client(fake).createRequestToken()).rejects.toMatchObject({ code: 'rate_limited', retryable: true });
  });

  it('un token de aplicación rechazado no se reintenta y el mensaje no lo contiene', async () => {
    const fake = createFakeTmdbFetch();
    const bad = new TmdbClient({ readToken: 'eyJotro.token.malo', fetchImpl: fake.fetchImpl, sleep: noSleep });
    const error = (await bad.createRequestToken().then(
      () => null,
      (e: unknown) => e,
    )) as SourceError;
    expect(error).toMatchObject({ code: 'auth', retryable: false });
    expect(error.message).toMatch(/TMDB_API_READ_TOKEN/);
    expect(error.message).not.toContain('eyJotro');
    expect(fake.calls).toHaveLength(1);
  });

  it('exige el token de la aplicación', () => {
    expect(() => new TmdbClient({ readToken: '' })).toThrow(SourceError);
  });
});

describe('sync de TMDb', () => {
  it('lee las seis listas paginadas como instantánea completa y solo con la sesión del usuario', async () => {
    const fake = createFakeTmdbFetch({ pageSize: 1 });
    const { credentials } = await authorize(fake);
    const batch = await syncTmdb(client(fake), syncContext(credentials!.sessionId));
    expect(batch).toMatchObject({ cursor: null, hasMore: false, snapshotComplete: true, partialErrors: [] });
    expect(batch.records).toHaveLength(7);
    expect(batch.stats).toEqual({ rating_movie: 3, rating_tv: 1, favorite_movie: 1, favorite_tv: 1, watchlist_movie: 1, watchlist_tv: 0 });
    // Tres páginas de valoradas de películas con un elemento por página.
    const ratedCalls = fake.calls.filter((c) => c.path.endsWith('/rated/movies'));
    expect(ratedCalls).toHaveLength(3);
    expect(fake.calls.filter((c) => c.path.startsWith('/3/account/')).every((c) => c.hasSession)).toBe(true);
  });

  it('valoraciones fuera de escala o elementos corruptos quedan como errores parciales', async () => {
    const lists = defaultLists();
    lists['rated/movies'] = [listItem('movie:603', 8.5), listItem('movie:27205', 7.3), listItem('movie:129', 11), { title: 'sin id' }];
    const fake = createFakeTmdbFetch({ lists });
    const { credentials } = await authorize(fake);
    const batch = await syncTmdb(client(fake), syncContext(credentials!.sessionId));
    expect(batch.partialErrors.map((e) => e.code)).toEqual(['invalid_rating', 'invalid_rating', 'invalid_record']);
    expect(batch.partialErrors[0]).toMatchObject({ sourceRecordId: 'movie:27205' });
    expect(batch.records).toHaveLength(5);
  });

  it('sin sesión o sin cuenta válida falla sin llamar a TMDb', async () => {
    const fake = createFakeTmdbFetch();
    await expect(syncTmdb(client(fake), syncContext(undefined))).rejects.toMatchObject({ code: 'verification_failed', retryable: false });
    await expect(syncTmdb(client(fake), syncContext('s', 'no-numerico'))).rejects.toMatchObject({ code: 'verification_failed' });
    expect(fake.calls).toHaveLength(0);
  });

  it('una sesión revocada en TMDb pide reconectar (no reintentable)', async () => {
    const fake = createFakeTmdbFetch();
    const { credentials } = await authorize(fake);
    fake.sessions.clear();
    await expect(syncTmdb(client(fake), syncContext(credentials!.sessionId))).rejects.toMatchObject({
      code: 'auth',
      retryable: false,
      message: expect.stringMatching(/vuelve a conectar TMDb/),
    });
  });
});

describe('mapper de TMDb (tmdb-v1)', () => {
  const map = (list: 'rating' | 'favorite' | 'watchlist', media: 'movie' | 'tv', key: string, rating?: number) =>
    mapTmdbRecord({ list, media, item: listItem(key, rating) }, ctx).map((o) => parseObservation(o));

  it('valorada: conocida y consumida, preferencia explícita normalizada en la escala real 0,5–10', () => {
    const [o] = map('rating', 'movie', 'movie:603', 8.5);
    expect(o).toMatchObject({
      observationKind: 'rating',
      sourceRecordId: 'movie:603',
      category: 'movies',
      knownConfidence: 1,
      consumedConfidence: 1,
      preferenceScore: 0.6842,
      preferenceConfidence: 1,
      preferenceBasis: 'explicit_rating',
      engagement: { type: 'rating', value: 8.5 },
      mapperVersion: 'tmdb-v1',
    });
    expect(map('rating', 'movie', 'movie:603', 10)[0]!.preferenceScore).toBe(1);
    expect(map('rating', 'movie', 'movie:603', 0.5)[0]!.preferenceScore).toBe(-1);
    expect(map('rating', 'movie', 'movie:603', 5)[0]!.preferenceScore).toBe(-0.0526);
    // Sin fecha en la API: no se inventa.
    expect(o!.occurredAt).toBeUndefined();
  });

  it('favorita: like explícito sin prueba de consumo; pendiente: conocida, sin consumo ni preferencia', () => {
    expect(map('favorite', 'tv', 'tv:1399')[0]).toMatchObject({
      observationKind: 'favorite',
      category: 'series',
      consumedConfidence: 0,
      preferenceScore: 0.8,
      preferenceConfidence: 0.9,
      preferenceBasis: 'explicit_like',
    });
    expect(map('watchlist', 'movie', 'movie:129')[0]).toMatchObject({
      observationKind: 'watchlist',
      knownConfidence: 1,
      consumedConfidence: 0,
      preferenceScore: null,
      preferenceConfidence: null,
      preferenceBasis: null,
    });
  });

  it('una película y una serie con el mismo número son objetos distintos', () => {
    const [movie] = map('rating', 'movie', 'movie:1396', 0.5);
    const [series] = map('rating', 'tv', 'tv:1396', 10);
    expect(movie!.externalItem).toMatchObject({ itemType: 'movie', canonicalIds: { 'tmdb:movie': '1396' } });
    expect(series!.externalItem).toMatchObject({ itemType: 'series', title: 'Breaking Bad', canonicalIds: { 'tmdb:tv': '1396' } });
    expect(movie!.sourceRecordId).not.toBe(series!.sourceRecordId);
  });

  it('el póster es una referencia al CDN de TMDb con sus condiciones; sin póster no se inventa imagen', () => {
    const [o] = map('rating', 'tv', 'tv:1396', 10);
    expect(o!.externalItem.imageCandidate).toMatchObject({
      url: 'https://image.tmdb.org/t/p/w500/simulado-tv-1396.jpg',
      source: 'tmdb',
      rightsOrPolicyReference: 'https://www.themoviedb.org/api-terms-of-use',
      isFallback: false,
    });
    expect(map('watchlist', 'movie', 'movie:129')[0]!.externalItem.imageCandidate).toBeUndefined();
    expect(map('rating', 'tv', 'tv:1396', 10)[0]!.externalItem.attributes).toEqual({ releaseYear: 2008 });
  });
});

describe('proveedor de catálogo TMDb', () => {
  const provider = (fake = createFakeTmdbFetch()) =>
    new TmdbCatalogProvider({
      readToken: SIMULATED_TMDB_READ_TOKEN,
      fetchImpl: fake.fetchImpl,
      sleep: noSleep,
      now: () => new Date('2026-10-08T12:00:00Z'),
    });
  const candidate = (category: 'movies' | 'series', canonicalIds: Record<string, string>) => ({
    category,
    itemType: category === 'movies' ? 'movie' : 'series',
    title: 'x',
    sourceKey: 'tmdb',
    sourceId: 'x',
    canonicalIds,
  });

  it('solo se usa en el dataset live y resuelve por su ID añadiendo IMDb y Wikidata', async () => {
    const p = provider();
    expect(p.datasets).toEqual(['live']);
    const match = await p.resolve(candidate('movies', { 'tmdb:movie': '603' }));
    expect(match).toMatchObject({ matchedBy: 'provider_id', confidence: 0.98 });
    expect(match!.item).toMatchObject({ id: 'movie:603', title: 'Matrix', category: 'movies', releaseDate: '1999-03-31' });
    expect(match!.item.externalIds).toEqual([
      { provider: 'tmdb', idType: 'movie', value: '603' },
      { provider: 'imdb', idType: 'title', value: 'tt0133093' },
      { provider: 'wikidata', idType: 'entity', value: 'Q83495' },
    ]);
    expect(match!.item.primaryImage).toMatchObject({ source: 'tmdb', restrictions: 'reference-only', attributionRequired: true });
    expect(match!.item.metadata).toMatchObject({
      providerCache: { provider: 'tmdb', providerItemId: 'movie:603', expiresAt: '2027-04-06T12:00:00.000Z' },
    });
  });

  it('nunca resuelve una serie con un ID de película; por IMDb respeta el tipo; un objeto retirado devuelve null', async () => {
    const p = provider();
    await expect(p.resolve(candidate('series', { 'tmdb:movie': '1396' }))).resolves.toBeNull();
    await expect(p.resolve(candidate('series', { 'imdb:title': 'tt0903747' }))).resolves.toMatchObject({
      matchedBy: 'canonical_id',
      item: { id: 'tv:1396', title: 'Breaking Bad' },
    });
    await expect(p.resolve(candidate('movies', { 'imdb:title': 'tt0903747' }))).resolves.toBeNull();
    await expect(p.resolve(candidate('movies', { 'tmdb:movie': '999999' }))).resolves.toBeNull();
    await expect(p.resolve({ ...candidate('movies', {}), category: 'games' as never })).resolves.toBeNull();
  });

  it('busca por título solo para sugerir (sin fusionar)', async () => {
    const results = await provider().search({ query: 'matrix', category: 'movies' });
    expect(results.map((r) => r.id)).toEqual(['movie:603']);
  });
});

describe('registro con TMDb', () => {
  it('sin token, TMDb aparece como «sin configurar» y no es conectable; ya no figura como prevista', () => {
    const registry = createAdapterRegistry({ demoMode: false });
    expect(registry.get('tmdb')).toBeUndefined();
    expect(registry.manifests().find((m) => m.key === 'tmdb')).toMatchObject({ availability: 'unconfigured', connectable: false });
    expect(PLANNED_MANIFESTS.map((m) => m.key)).not.toContain('tmdb');
  });

  it('con token se registra el adapter con las capacidades verificadas', () => {
    const registry = createAdapterRegistry({ demoMode: false, tmdb: { readToken: SIMULATED_TMDB_READ_TOKEN } });
    const tmdb = registry.manifests().find((m) => m.key === 'tmdb');
    expect(tmdb).toMatchObject({
      availability: 'available',
      connectable: true,
      simulated: false,
      authentication: 'provider-session',
      categories: ['movies', 'series'],
      capabilities: { known: true, consumed: true, explicitRating: true, implicitPreference: false, history: false, incrementalSync: false },
    });
    expect(registry.get('tmdb')?.snapshotObservationKinds).toEqual(['rating', 'favorite', 'watchlist']);
  });
});
