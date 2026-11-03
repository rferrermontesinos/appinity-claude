import { parseObservation, type EntityIdentifier, type IdentifiedEntity, type SyncContext } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { createFacebookAdapter, facebookPageKind, mapFacebook, type FacebookLike } from '../src/profile/facebook/index.js';

/** Facebook y el catálogo SIMULADOS: nada sale a la red. */
const USER = '10000000-0000-4000-a000-0000000000f1';
const entity = (category: IdentifiedEntity['category'], title: string, method = 'wikidata_facebook'): IdentifiedEntity => ({
  category,
  itemType: category === 'food' ? 'restaurant' : category === 'music' ? 'artist' : 'series',
  title,
  canonicalIds: { 'wikidata:entity': 'Q1' },
  confidence: 0.95,
  method,
});
const like = (id: string, name: string, extra: Partial<FacebookLike> = {}): FacebookLike => ({ id, name, ...extra });

describe('Facebook · tipo de página', () => {
  it('restaurante o lugar cultural solo con ubicación; grupos, series, libros y juegos por su categoría; marcas fuera', () => {
    const at = { latitude: 41.39, longitude: 2.16 };
    expect(facebookPageKind({ category: 'Restaurant', location: at })).toEqual({ kind: 'place', category: 'food' });
    expect(facebookPageKind({ category: 'Restaurant' })).toBeNull();
    expect(facebookPageKind({ category: 'Art Museum', location: at })).toEqual({ kind: 'place', category: 'culture' });
    expect(facebookPageKind({ category: 'Musician/Band' })).toEqual({ kind: 'artist' });
    expect(facebookPageKind({ category: 'TV Show' })).toEqual({ kind: 'work', categories: ['series'] });
    expect(facebookPageKind({ category: 'Book Series' })).toEqual({ kind: 'work', categories: ['books'] });
    expect(facebookPageKind({ category: 'Video Game' })).toEqual({ kind: 'work', categories: ['games'] });
    expect(facebookPageKind({ category: 'Clothing (Brand)' })).toBeNull();
  });

  it('semántica: me gusta débil (+0,6), no consumido, y menos confianza si tiene más de 5 años', () => {
    const now = new Date('2026-10-26T00:00:00Z');
    const map = (created: string) =>
      parseObservation(mapFacebook({ recordId: 'page:1', like: like('1', 'Crims', { created_time: created }), identified: entity('podcasts', 'Crims') }, { userId: USER, connectionId: USER, source: 'facebook' }, now)[0]!);
    expect(map('2025-01-01T10:00:00+0000')).toMatchObject({ preferenceScore: 0.6, preferenceBasis: 'explicit_like', consumedConfidence: 0, knownConfidence: 0.95, preferenceConfidence: 0.57 });
    expect(map('2015-01-01T10:00:00+0000').preferenceConfidence).toBeCloseTo(0.57 * 0.7, 4);
  });
});

describe('Facebook · conexión y sync', () => {
  function fakeFacebook(options: { granted?: boolean } = {}) {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      urls.push(url.toString());
      if (url.pathname.endsWith('/oauth/access_token')) {
        return new Response(JSON.stringify(url.searchParams.get('grant_type') === 'fb_exchange_token' ? { access_token: 'largo', expires_in: 5_184_000 } : { access_token: 'corto', expires_in: 3600 }));
      }
      if (url.pathname.endsWith('/me/permissions')) {
        return new Response(JSON.stringify({ data: [{ permission: 'user_likes', status: options.granted === false ? 'declined' : 'granted' }] }));
      }
      if (url.pathname.endsWith('/me/likes')) {
        if (!url.searchParams.get('after')) {
          return new Response(
            JSON.stringify({
              data: [
                like('10', 'Vetusta Morla', { username: 'vetustamorla', category: 'Musician/Band' }),
                like('11', 'Casa Lucio', { category: 'Spanish Restaurant', location: { latitude: 40.41, longitude: -3.71 } }),
              ],
              paging: { next: 'https://graph.facebook.com/v23.0/me/likes?after=X&access_token=largo' },
            }),
          );
        }
        return new Response(JSON.stringify({ data: [like('12', 'Stranger Things', { category: 'TV Show' }), like('13', 'Zara', { category: 'Clothing (Brand)' }), like('14', 'Serie Desconocida', { category: 'TV Show' })] }));
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
    return { urls, fetchImpl };
  }

  const identifier = {
    identifyByExternalIds: async (items: Array<{ facebook?: string }>) => items.map((i) => (i.facebook === 'vetustamorla' ? entity('music', 'Vetusta Morla') : null)),
    identifyPlace: async (p: { name: string }) => (p.name === 'Casa Lucio' ? entity('food', 'Casa Lucio', 'osm') : null),
    identifyArtists: async () => [{ entity: null }],
    identifyWork: async (w: { title: string }) => (w.title === 'Stranger Things' ? entity('series', 'Stranger Things', 'wikidata_title') : null),
  } as unknown as EntityIdentifier;

  it('pide solo user_likes, cambia el código por un token de 60 días y exige que el permiso se haya concedido', async () => {
    const { urls, fetchImpl } = fakeFacebook();
    const adapter = createFacebookAdapter({ appId: '1234567890', appSecret: 'secreto', redirectUri: 'http://localhost:3100/v1/connect/facebook/callback', fetchImpl });
    const start = await adapter.connect({ userId: USER, state: 'estado-123' } as never);
    expect(start.kind).toBe('redirect');
    const auth = new URL((start as { url: string }).url);
    expect(auth.searchParams.get('scope')).toBe('user_likes');
    expect(auth.searchParams.get('state')).toBe('estado-123');
    const done = await adapter.completeConnect!({ userId: USER, callbackParams: { code: 'abc' } } as never);
    expect(done).toMatchObject({ kind: 'connected', credentials: { accessToken: 'largo' }, scopes: ['user_likes'] });
    expect(urls.some((u) => u.includes('grant_type=fb_exchange_token'))).toBe(true);

    const declined = createFacebookAdapter({ appId: '1', appSecret: 's', redirectUri: 'http://localhost/cb', fetchImpl: fakeFacebook({ granted: false }).fetchImpl });
    await expect(declined.completeConnect!({ userId: USER, callbackParams: { code: 'abc' } } as never)).rejects.toThrow(/no se concedió/i);
  });

  it('recorre las páginas e identifica: cuenta en Wikidata, restaurante por OpenStreetMap y serie por título; las marcas se ignoran', async () => {
    const { fetchImpl } = fakeFacebook();
    const adapter = createFacebookAdapter({ appId: '1', appSecret: 's', redirectUri: 'http://localhost/cb', fetchImpl, identifier });
    const batch = await adapter.sync({ userId: USER, credentials: { accessToken: 'largo' } } as unknown as SyncContext);
    expect(batch.records.map((r) => (r as { identified: IdentifiedEntity }).identified.title)).toEqual(['Vetusta Morla', 'Casa Lucio', 'Stranger Things']);
    expect(batch.stats).toEqual({ facebook_likes: 5, facebook_identified: 3, facebook_ignored: 1 });
    expect(batch.partialErrors).toEqual([{ code: 'unidentified', message: '1 páginas de Facebook no se pudieron identificar con seguridad', blocking: false }]);
  });
});

describe('Wikidata · cuentas de Facebook e Instagram', () => {
  it('identifica por P2013/P2003 en cualquier categoría (un artista) e ignora nombres de usuario no válidos', async () => {
    const { WikidataWorkIdentifier } = await import('../src/catalog/wikidata-works.js');
    const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
    const entities: Record<string, unknown> = {
      Q100: { id: 'Q100', labels: { es: { value: 'Rosalía' } }, claims: { P31: [claim({ id: 'Q5' })], P106: [claim({ id: 'Q177220' })], P2013: [claim('rosalia')], P2003: [claim('rosalia.vt')] } },
    };
    const searches: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.searchParams.get('action') === 'query') {
        searches.push(url.searchParams.get('srsearch')!);
        return new Response(JSON.stringify({ query: { search: [{ title: 'Q100' }] } }));
      }
      const ids = url.searchParams.get('ids')!.split('|');
      return new Response(JSON.stringify({ entities: Object.fromEntries(ids.map((id) => [id, entities[id]])) }));
    }) as typeof fetch;
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined });
    const [fb, ig, invalid] = await wd.identifyByExternalIds([
      { facebook: 'rosalia', kind: 'social' },
      { instagram: 'rosalia.vt', kind: 'social' },
      { facebook: 'nombre con espacios', kind: 'social' },
    ]);
    expect(fb).toMatchObject({ category: 'music', title: 'Rosalía', method: 'wikidata_facebook' });
    expect(ig).toMatchObject({ category: 'music', method: 'wikidata_instagram' });
    expect(invalid).toBeNull();
    expect(searches.join(' ')).not.toContain('espacios');
  });
});
