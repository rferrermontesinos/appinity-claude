import { parseObservation, type IdentifiedEntity, type SyncContext } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { WikidataWorkIdentifier } from '../src/catalog/wikidata-works.js';
import { aniListCategories, collectAniList, createAniListAdapter, mapAniList, type AniListItem } from '../src/profile/anilist/index.js';

/** AniList y Wikidata SIMULADOS: nada sale a la red. */
const USER = '10000000-0000-4000-a000-0000000000c1';
const media = (id: number, title: string, extra: Record<string, unknown> = {}) => ({ id, idMal: id + 1000, type: 'ANIME' as 'ANIME' | 'MANGA', format: 'TV', isFavourite: false, title: { romaji: title, english: null }, ...extra });
const entity = (category: 'movies' | 'series' | 'books', title: string): IdentifiedEntity => ({ category, itemType: category === 'books' ? 'book' : category === 'movies' ? 'movie' : 'series', title, canonicalIds: { 'wikidata:entity': 'Q1' }, confidence: 0.95, method: 'wikidata_anilist' });

describe('AniList · listas', () => {
  it('una entrada por obra; puntuación 0 = sin puntuar; fecha de fin o, si falta, de actualización', () => {
    const items = collectAniList('anime', [
      { status: 'COMPLETED', score: 85, completedAt: { year: 2024, month: 3, day: 7 }, media: media(21, 'One Piece') },
      { status: 'PLANNING', score: 0, updatedAt: 1_700_000_000, media: media(199, 'Sen to Chihiro', { format: 'MOVIE', title: { romaji: 'Sen to Chihiro', english: 'Spirited Away' } }) },
      { status: 'CURRENT', score: 0, media: media(21, 'Duplicada') },
      { status: 'COMPLETED', score: 50, media: null },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ anilistId: 21, malId: 1021, score: 85, status: 'COMPLETED', date: '2024-03-07T00:00:00Z' });
    expect(items[1]).toMatchObject({ title: 'Spirited Away', score: null, format: 'MOVIE', date: new Date(1_700_000_000_000).toISOString() });
    expect(aniListCategories(items[1]!)).toEqual(['movies']);
    expect(aniListCategories({ kind: 'manga', format: 'NOVEL' })).toEqual(['books']);
  });

  it('semántica: puntuación explícita; favorito → me gusta; visto/abandonado → consumido NULL; planeado → conocido', () => {
    const map = (i: Partial<AniListItem>) =>
      parseObservation(
        mapAniList({ recordId: 'anime:1', item: { kind: 'anime', anilistId: 1, title: 'T', score: null, status: 'COMPLETED', favorite: false, ...i }, identified: entity('series', 'T') }, { userId: USER, connectionId: USER, source: 'anilist' })[0]!,
      );
    expect(map({ score: 100 })).toMatchObject({ preferenceScore: 1, preferenceBasis: 'explicit_rating', consumedConfidence: 0.95 });
    expect(map({ score: 1 })).toMatchObject({ preferenceScore: -1 });
    expect(map({ favorite: true, status: 'PLANNING' })).toMatchObject({ preferenceScore: 0.8, preferenceBasis: 'explicit_like', consumedConfidence: 0.95 });
    expect(map({})).toMatchObject({ preferenceScore: null, consumedConfidence: 0.95, engagement: { type: 'completed' } });
    expect(map({ status: 'DROPPED' })).toMatchObject({ preferenceScore: null, consumedConfidence: 0.95, engagement: { type: 'played', unit: 'dropped' } });
    expect(map({ status: 'PLANNING' })).toMatchObject({ preferenceScore: null, consumedConfidence: 0, engagement: { type: 'saved' } });
  });
});

describe('AniList · conexión y sync', () => {
  function fakeAniList() {
    const requests: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push({ url, headers: init?.headers as Record<string, string>, body });
      if (url === 'https://anilist.co/api/v2/oauth/token') return new Response(JSON.stringify({ token_type: 'Bearer', expires_in: 31_536_000, access_token: 'token-anilist' }));
      const query = String(body.query);
      if (query.includes('Viewer')) return new Response(JSON.stringify({ data: { Viewer: { id: 77 } } }));
      const vars = body.variables as { type: string };
      const entries =
        vars.type === 'ANIME'
          ? [
              { status: 'COMPLETED', score: 90, media: media(21, 'One Piece') },
              { status: 'PLANNING', score: 0, media: media(5, 'Desconocido') },
            ]
          : [{ status: 'CURRENT', score: 0, media: media(30013, 'One Piece', { type: 'MANGA', format: 'MANGA', isFavourite: true }) }];
      return new Response(JSON.stringify({ data: { MediaListCollection: { hasNextChunk: false, lists: [{ entries }] } } }));
    }) as typeof fetch;
    return { requests, fetchImpl };
  }

  it('autoriza con authorization code y canjea el código con el secreto en el servidor', async () => {
    const { requests, fetchImpl } = fakeAniList();
    const adapter = createAniListAdapter({ clientId: '123', clientSecret: 'secreto', redirectUri: 'http://localhost:3100/v1/connect/anilist/callback', fetchImpl });
    const start = await adapter.connect({ userId: USER, redirectUri: 'x', state: 'estado-0123456789abcdef' });
    const url = new URL((start as { url: string }).url);
    expect(url.origin + url.pathname).toBe('https://anilist.co/api/v2/oauth/authorize');
    expect([url.searchParams.get('client_id'), url.searchParams.get('response_type'), url.searchParams.get('state')]).toEqual(['123', 'code', 'estado-0123456789abcdef']);
    const done = await adapter.completeConnect!({ userId: USER, redirectUri: 'x', callbackParams: { code: 'codigo' }, pending: {} });
    expect(done).toMatchObject({ kind: 'connected', credentials: { accessToken: 'token-anilist', accessTokenExpiresAt: expect.any(String) } });
    expect(requests[0]!.body).toMatchObject({ grant_type: 'authorization_code', code: 'codigo', client_id: '123', client_secret: 'secreto' });
  });

  it('sync: lee anime y manga del usuario autenticado, identifica por AniList y avisa de lo no identificado', async () => {
    const { requests, fetchImpl } = fakeAniList();
    const identifier = {
      identifyByExternalIds: async (items: Array<{ anilist?: number; kind: string }>) =>
        items.map((i) => (i.anilist === 21 ? entity('series', 'One Piece') : i.anilist === 30013 && i.kind === 'manga' ? entity('books', 'One Piece (manga)') : null)),
      identifyWork: async () => null,
    } as unknown as Parameters<typeof createAniListAdapter>[0]['identifier'];
    const adapter = createAniListAdapter({ clientId: '123', clientSecret: 's', redirectUri: 'r', fetchImpl, identifier });
    const context = { credentials: { accessToken: 'token-anilist' }, connection: { id: USER, userId: USER, sourceKey: 'anilist', status: 'active', cursor: null }, cursor: null, pageSize: 50, now: new Date() } as unknown as SyncContext;
    const batch = await adapter.sync(context);
    expect(requests).toHaveLength(3);
    expect(requests[1]!.headers).toMatchObject({ Authorization: 'Bearer token-anilist' });
    expect(requests[1]!.body.variables).toMatchObject({ userId: 77, type: 'ANIME' });
    expect(batch.records.map((r) => (r as { identified: IdentifiedEntity }).identified.title).sort()).toEqual(['One Piece', 'One Piece (manga)']);
    expect(batch.partialErrors).toEqual([expect.objectContaining({ code: 'unidentified', blocking: false })]);
  });

  it('un token caducado pide volver a conectar', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ errors: [{ message: 'Invalid token', status: 400 }] }), { status: 400 })) as typeof fetch;
    const adapter = createAniListAdapter({ clientId: '1', clientSecret: 's', redirectUri: 'r', fetchImpl, identifier: { identifyWork: async () => null } as never });
    await expect(adapter.sync({ credentials: { accessToken: 'viejo' } } as unknown as SyncContext)).rejects.toMatchObject({ code: 'auth' });
  });
});

describe('Wikidata · AniList y MyAnimeList', () => {
  it('anime a cine o series, manga a libros; el tipo de origen debe coincidir', async () => {
    const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
    const entities: Record<string, unknown> = {
      Q710324: { id: 'Q710324', labels: { es: { value: 'One Piece' } }, claims: { P31: [claim({ id: 'Q63952888' })], P8729: [claim('21')] } },
      Q28667972: { id: 'Q28667972', labels: { es: { value: 'One Piece (manga)' } }, claims: { P31: [claim({ id: 'Q21198342' })], P8731: [claim('30013')], P4087: [claim('13')] } },
    };
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.searchParams.get('action') === 'query') return new Response(JSON.stringify({ query: { search: [{ title: 'Q710324' }, { title: 'Q28667972' }] } }));
      const ids = url.searchParams.get('ids')!.split('|');
      return new Response(JSON.stringify({ entities: Object.fromEntries(ids.map((id) => [id, entities[id]])) }));
    }) as typeof fetch;
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined });
    const [anime, manga, byMal, wrongKind] = await wd.identifyByExternalIds([
      { anilist: 21, kind: 'anime' },
      { anilist: 30013, kind: 'manga' },
      { mal: 13, kind: 'manga' },
      { anilist: 21, kind: 'manga' },
    ]);
    expect(anime).toMatchObject({ category: 'series', method: 'wikidata_anilist' });
    expect(manga).toMatchObject({ category: 'books', title: 'One Piece (manga)', method: 'wikidata_anilist' });
    expect(byMal).toMatchObject({ category: 'books', method: 'wikidata_mal' });
    expect(wrongKind).toBeNull();
  });
});
