import { parseObservation, type IdentifiedEntity, type SyncContext } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { WikidataWorkIdentifier } from '../src/catalog/wikidata-works.js';
import { collectBooks, createGoogleBooksAdapter, googleBooksConnection, mapBook, parseReviewRating, type BookRecord } from '../src/profile/google-books/index.js';

/** Google Books y Wikidata SIMULADOS: nada sale a la red. */
const USER = '10000000-0000-4000-a000-0000000000b0';
const book = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, volumeInfo: { title, authors: ['Autora'], industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000001' }] }, ...extra });
const entity = (title: string): IdentifiedEntity => ({ category: 'books', itemType: 'book', title, canonicalIds: { 'wikidata:entity': 'Q1' }, confidence: 0.95, method: 'wikidata_google_books' });

describe('Google Books · lectura de estanterías', () => {
  it('une estanterías por volumen, conserva la reseña y descarta volúmenes sin título', () => {
    const books = collectBooks([
      { kind: 'favorites', items: [book('v1', 'Rayuela')] },
      { kind: 'have_read', items: [book('v1', 'Rayuela'), book('v2', 'Ficciones'), { id: 'v3', volumeInfo: {} }] },
      { kind: 'reviewed', items: [book('v2', 'Ficciones', { userInfo: { review: { rating: 'FOUR' }, updated: '2026-05-01T10:00:00Z' } })] },
    ]);
    expect(books).toEqual([
      expect.objectContaining({ volumeId: 'v1', shelves: ['favorites', 'have_read'], rating: null, isbn13: '9780000000001' }),
      expect.objectContaining({ volumeId: 'v2', shelves: ['have_read', 'reviewed'], rating: 4, updated: '2026-05-01T10:00:00Z' }),
    ]);
    expect([parseReviewRating('FIVE'), parseReviewRating(3), parseReviewRating('NOT_RATED'), parseReviewRating(undefined)]).toEqual([5, 3, null, null]);
  });

  it('semántica: reseña → valoración; favorito → me gusta; leído → consumido; por leer o comprado → solo conocido', () => {
    const map = (b: Partial<BookRecord>) =>
      parseObservation(
        mapBook({ recordId: 'volume:x', book: { volumeId: 'x', title: 'T', authors: [], shelves: [], rating: null, ...b }, identified: entity('T') }, { userId: USER, connectionId: USER, source: 'google_books' })[0]!,
      );
    expect(map({ shelves: ['reviewed', 'have_read'], rating: 5 })).toMatchObject({ preferenceScore: 1, preferenceBasis: 'explicit_rating', consumedConfidence: 0.95 });
    expect(map({ shelves: ['favorites'] })).toMatchObject({ preferenceScore: 0.8, preferenceBasis: 'explicit_like', consumedConfidence: 0 });
    expect(map({ shelves: ['have_read'] })).toMatchObject({ preferenceScore: null, consumedConfidence: 0.95, engagement: { type: 'completed' } });
    expect(map({ shelves: ['to_read'] })).toMatchObject({ preferenceScore: null, consumedConfidence: 0, engagement: { type: 'saved' } });
    expect(map({ shelves: ['purchased'] })).toMatchObject({ engagement: { type: 'owned' } });
    expect(map({ shelves: ['have_read'] }).externalItem.canonicalIds).toMatchObject({ 'google_books:volume': 'x' });
  });
});

describe('Google Books · conexión y sync', () => {
  const fake = () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      calls.push(url.replace(/\?.*$/, ''));
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        const form = new URLSearchParams(String(init!.body));
        return new Response(JSON.stringify({ access_token: 'access-simulado', ...(form.get('grant_type') === 'authorization_code' ? { refresh_token: 'refresh-simulado', scope: 'https://www.googleapis.com/auth/books' } : {}) }));
      }
      const shelf = /bookshelves\/(\d+)\/volumes/.exec(url)?.[1];
      const items = shelf === '0' ? [book('vol-fav-0001', 'Rayuela')] : shelf === '4' ? [book('vol-fav-0001', 'Rayuela'), book('vol-xx-0002', 'Libro desconocido')] : [];
      return new Response(JSON.stringify({ totalItems: items.length, items }));
    }) as typeof fetch;
    return { calls, fetchImpl };
  };

  it('pide solo el scope de Books con acceso offline y PKCE; canjea el código y guarda el refresh token', async () => {
    const { fetchImpl } = fake();
    const adapter = createGoogleBooksAdapter({ clientId: 'cliente', clientSecret: 'secreto', redirectUri: 'http://localhost:3100/v1/connect/google_books/callback', fetchImpl });
    const start = await adapter.connect({ userId: USER, redirectUri: 'x', state: 'estado-0123456789abcdef' });
    expect(start.kind).toBe('redirect');
    const params = new URL((start as { url: string }).url).searchParams;
    expect([params.get('scope'), params.get('access_type'), params.get('code_challenge_method'), params.get('state')]).toEqual([
      'https://www.googleapis.com/auth/books',
      'offline',
      'S256',
      'estado-0123456789abcdef',
    ]);
    const done = await adapter.completeConnect!({ userId: USER, redirectUri: 'x', callbackParams: { code: 'c' }, pending: (start as { pending: Record<string, string> }).pending });
    expect(done).toMatchObject({ kind: 'connected', credentials: { refreshToken: 'refresh-simulado' } });
    expect(() => googleBooksConnection({ access_token: 'a', scope: 'openid email' })).toThrow(/Google Books/);
  });

  it('sync: renueva el acceso, lee las estanterías, identifica y avisa de lo no identificado', async () => {
    const { calls, fetchImpl } = fake();
    const identifier = {
      // Sin etiqueta en Wikidata (título = QID): se usa el título de Google Books.
      identifyGoogleBooksVolume: async (id: string) => (id === 'vol-fav-0001' ? entity('Q1') : null),
      identifyWork: async () => null,
    } as unknown as Parameters<typeof createGoogleBooksAdapter>[0]['identifier'];
    const adapter = createGoogleBooksAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl, identifier });
    const context = { credentials: { refreshToken: 'refresh-simulado' }, connection: { id: USER, userId: USER, sourceKey: 'google_books', status: 'active', cursor: null }, cursor: null, pageSize: 50, now: new Date() } as unknown as SyncContext;
    const batch = await adapter.sync(context);
    expect(calls).toContain('https://oauth2.googleapis.com/token');
    expect(calls.filter((c) => c.includes('/mylibrary/bookshelves/')).length).toBe(7);
    expect(batch.records).toHaveLength(1);
    expect((batch.records[0] as { book: BookRecord }).book.shelves).toEqual(['favorites', 'have_read']);
    expect((batch.records[0] as { identified: IdentifiedEntity }).identified.title).toBe('Rayuela');
    expect(batch.partialErrors).toEqual([expect.objectContaining({ code: 'unidentified', blocking: false })]);
    expect(batch).toMatchObject({ snapshotComplete: true, snapshotKinds: ['gbooks_shelf'] });
  });
});

describe('Wikidata · ID de Google Books (P675)', () => {
  it('una edición se atribuye a su obra', async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      if (url.searchParams.get('action') === 'query') return new Response(JSON.stringify({ query: { search: [{ title: 'Q10' }] } }));
      const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
      const id = url.searchParams.get('ids')!;
      const entities: Record<string, unknown> = {
        Q10: { id: 'Q10', labels: { es: { value: 'Rayuela (edición)' } }, claims: { P31: [claim({ id: 'Q3331189' })], P629: [claim({ id: 'Q20' })] } },
        Q20: { id: 'Q20', labels: { es: { value: 'Rayuela' } }, claims: { P31: [claim({ id: 'Q7725634' })], P577: [claim({ time: '+1963-00-00T00:00:00Z' })] } },
      };
      return new Response(JSON.stringify({ entities: { [id]: entities[id] } }));
    }) as typeof fetch;
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined });
    expect(await wd.identifyGoogleBooksVolume('abcDEF12345')).toMatchObject({ title: 'Rayuela', canonicalIds: { 'wikidata:entity': 'Q20' }, releaseYear: 1963, method: 'wikidata_google_books_edicion' });
  });
});
