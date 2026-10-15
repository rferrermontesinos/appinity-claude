import { parseObservation, type IdentifiedEntity, type SyncContext } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { WikidataWorkIdentifier } from '../src/catalog/wikidata-works.js';
import { collectTrakt, createTraktAdapter, mapTrakt, type TraktItem } from '../src/profile/trakt/index.js';

/** Trakt y Wikidata SIMULADOS: nada sale a la red. */
const USER = '10000000-0000-4000-a000-0000000000c0';
const movie = (trakt: number, title: string, imdb?: string) => ({ title, year: 1994, ids: { trakt, slug: 's', imdb: imdb ?? null, tmdb: 278 } });
const show = (trakt: number, title: string) => ({ title, year: 2008, ids: { trakt, slug: 's', imdb: 'tt0903747', tmdb: 1396 } });
const entity = (category: 'movies' | 'series', title: string): IdentifiedEntity => ({ category, itemType: category === 'movies' ? 'movie' : 'series', title, canonicalIds: { 'wikidata:entity': 'Q1' }, confidence: 0.95, method: 'wikidata_imdb' });

describe('Trakt · listas', () => {
  it('une valoraciones, vistos, favoritos y pendientes por título; descarta valoraciones fuera de 1–10', () => {
    const items = collectTrakt({
      ratings: [{ rating: 9, rated_at: '2026-01-01T00:00:00Z', movie: movie(1, 'Cadena perpetua', 'tt0111161') }, { rating: 11, movie: movie(2, 'Raro') }],
      watched: [{ plays: 3, last_watched_at: '2026-02-01T00:00:00Z', movie: movie(1, 'Cadena perpetua', 'tt0111161') }, { plays: 1, show: show(10, 'Breaking Bad') }],
      favorites: [{ show: show(10, 'Breaking Bad') }],
      watchlist: [{ movie: movie(3, 'Pendiente') }],
    });
    expect(items.find((i) => i.traktId === 1)).toMatchObject({ kind: 'movie', rating: 9, plays: 3, imdb: 'tt0111161', date: '2026-02-01T00:00:00Z' });
    expect(items.find((i) => i.traktId === 2)).toMatchObject({ rating: null });
    expect(items.find((i) => i.traktId === 10)).toMatchObject({ kind: 'show', favorite: true, plays: 1 });
    expect(items.find((i) => i.traktId === 3)).toMatchObject({ watchlist: true, plays: 0 });
  });

  it('semántica: valoración 1–10 explícita; favorito → me gusta; visto → consumido; pendiente → conocido', () => {
    const map = (i: Partial<TraktItem>, cat: 'movies' | 'series' = 'movies') =>
      parseObservation(
        mapTrakt({ recordId: 'movie:1', item: { kind: 'movie', traktId: 1, title: 'T', rating: null, plays: 0, favorite: false, watchlist: false, ...i }, identified: entity(cat, 'T') }, { userId: USER, connectionId: USER, source: 'trakt' })[0]!,
      );
    expect(map({ rating: 10 })).toMatchObject({ preferenceScore: 1, preferenceBasis: 'explicit_rating', consumedConfidence: 0.95 });
    expect(map({ rating: 1 })).toMatchObject({ preferenceScore: -1 });
    expect(map({ favorite: true }, 'series')).toMatchObject({ preferenceScore: 0.8, preferenceBasis: 'explicit_like' });
    expect(map({ plays: 2 })).toMatchObject({ preferenceScore: null, consumedConfidence: 0.95, engagement: { type: 'completed', value: 2 } });
    expect(map({ watchlist: true })).toMatchObject({ preferenceScore: null, consumedConfidence: 0, engagement: { type: 'saved' } });
  });
});

describe('Trakt · conexión y sync', () => {
  function fakeTrakt() {
    const requests: Array<{ url: string; headers: Record<string, string>; body?: Record<string, string> }> = [];
    let refreshCount = 0;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      requests.push({ url, headers: init?.headers as Record<string, string>, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (url === 'https://auth.trakt.tv/oauth/token') {
        refreshCount++;
        return new Response(JSON.stringify({ access_token: `access-${refreshCount}`, refresh_token: `refresh-nuevo-${refreshCount}`, expires_in: 604800, token_type: 'bearer', scope: 'public', created_at: 1 }));
      }
      const path = new URL(url).pathname;
      const data: Record<string, unknown[]> = {
        '/sync/ratings/movies': [{ rating: 9, rated_at: '2026-01-01T00:00:00Z', movie: movie(1, 'Cadena perpetua', 'tt0111161') }],
        '/sync/watched/shows': [{ plays: 5, show: show(10, 'Breaking Bad') }],
        '/sync/watchlist/movies/rank/asc': [{ movie: movie(3, 'Sin identificar') }],
      };
      return new Response(JSON.stringify(data[path] ?? []), { headers: { 'x-pagination-page-count': '1' } });
    }) as typeof fetch;
    return { requests, fetchImpl };
  }

  it('autoriza en auth.trakt.tv con PKCE y canjea el código con el verificador', async () => {
    const { requests, fetchImpl } = fakeTrakt();
    const adapter = createTraktAdapter({ clientId: 'cliente-trakt', redirectUri: 'http://localhost:3100/v1/connect/trakt/callback', fetchImpl });
    const start = await adapter.connect({ userId: USER, redirectUri: 'x', state: 'estado-0123456789abcdef' });
    const url = new URL((start as { url: string }).url);
    expect(url.origin + url.pathname).toBe('https://auth.trakt.tv/oauth/authorize');
    expect([url.searchParams.get('client_id'), url.searchParams.get('code_challenge_method'), url.searchParams.get('state')]).toEqual(['cliente-trakt', 'S256', 'estado-0123456789abcdef']);
    const done = await adapter.completeConnect!({ userId: USER, redirectUri: 'x', callbackParams: { code: 'codigo' }, pending: (start as { pending: Record<string, string> }).pending });
    expect(done).toMatchObject({ kind: 'connected', credentials: { refreshToken: 'refresh-nuevo-1' } });
    expect(requests[0]!.body).toMatchObject({ grant_type: 'authorization_code', code: 'codigo', code_verifier: expect.any(String), client_id: 'cliente-trakt' });
    expect(requests[0]!.body!.client_secret).toBeUndefined();
  });

  it('sync: guarda el refresh token rotado, envía las cabeceras de Trakt, identifica por IMDb y avisa de lo no identificado', async () => {
    const { requests, fetchImpl } = fakeTrakt();
    const identifier = {
      identifyByExternalIds: async (items: Array<{ imdb?: string; kind: string }>) =>
        items.map((i) => (i.imdb === 'tt0111161' ? entity('movies', 'Cadena perpetua') : i.imdb === 'tt0903747' ? entity('series', 'Breaking Bad') : null)),
      identifyWork: async () => null,
    } as unknown as Parameters<typeof createTraktAdapter>[0]['identifier'];
    const adapter = createTraktAdapter({ clientId: 'cliente-trakt', redirectUri: 'r', fetchImpl, identifier });
    const saved: Array<Record<string, string>> = [];
    const context = {
      credentials: { refreshToken: 'refresh-viejo' },
      saveState: async (patch: Record<string, string>) => void saved.push(patch),
      connection: { id: USER, userId: USER, sourceKey: 'trakt', status: 'active', cursor: null },
      cursor: null,
      pageSize: 50,
      now: new Date(),
    } as unknown as SyncContext;
    const batch = await adapter.sync(context);
    expect(saved).toEqual([{ refreshToken: 'refresh-nuevo-1' }]);
    const api = requests.filter((r) => r.url.startsWith('https://api.trakt.tv'));
    expect(api.length).toBe(8);
    expect(api[0]!.headers).toMatchObject({ 'trakt-api-key': 'cliente-trakt', 'trakt-api-version': '2', Authorization: 'Bearer access-1' });
    expect(batch.records.map((r) => (r as { identified: IdentifiedEntity }).identified.title).sort()).toEqual(['Breaking Bad', 'Cadena perpetua']);
    expect(batch.partialErrors).toEqual([expect.objectContaining({ code: 'unidentified', blocking: false })]);
  });
});

describe('Wikidata · IMDb y TMDB', () => {
  it('por lotes; la categoría debe coincidir con la de Trakt', async () => {
    const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
    const entities: Record<string, unknown> = {
      Q172241: { id: 'Q172241', labels: { es: { value: 'Cadena perpetua' } }, claims: { P31: [claim({ id: 'Q11424' })], P345: [claim('tt0111161')], P577: [claim({ time: '+1994-09-10T00:00:00Z' })] } },
      Q1079: { id: 'Q1079', labels: { es: { value: 'Breaking Bad' } }, claims: { P31: [claim({ id: 'Q5398426' })], P4983: [claim('1396')] } },
    };
    let searches = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.searchParams.get('action') === 'query') {
        searches++;
        return new Response(JSON.stringify({ query: { search: [{ title: 'Q172241' }, { title: 'Q1079' }] } }));
      }
      const ids = url.searchParams.get('ids')!.split('|');
      return new Response(JSON.stringify({ entities: Object.fromEntries(ids.map((id) => [id, entities[id]])) }));
    }) as typeof fetch;
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined });
    const [shawshank, breaking, wrongKind] = await wd.identifyByExternalIds([
      { imdb: 'tt0111161', kind: 'movie' },
      { tmdb: 1396, kind: 'show' },
      { imdb: 'tt0111161', kind: 'show' },
    ]);
    expect(shawshank).toMatchObject({ category: 'movies', title: 'Cadena perpetua', releaseYear: 1994, method: 'wikidata_imdb' });
    expect(breaking).toMatchObject({ category: 'series', method: 'wikidata_tmdb' });
    expect(wrongKind).toBeNull();
    expect(searches).toBe(1);
  });
});
