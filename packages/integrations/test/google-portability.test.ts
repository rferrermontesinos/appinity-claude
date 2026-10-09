import { parseObservation, SourceError, type SourceCredentials, type SyncContext } from '@appinity/shared';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { classifyOsmTags, pickPlace, slotWaitMs, OsmPlaceIdentifier } from '../src/catalog/osm-places.js';
import { WikidataWorkIdentifier } from '../src/catalog/wikidata-works.js';
import { googlePlaceIds, parseStars, readArchive, urlPattern } from '../src/profile/google-portability/archive.js';
import { completePortabilityConnect, startPortabilityConnect } from '../src/profile/google-portability/auth.js';
import { GooglePortabilityClient } from '../src/profile/google-portability/client.js';
import { PHASE3_RESOURCE_GROUPS } from '../src/profile/google-portability/constants.js';
import {
  FAKE_CLIENT,
  FAKE_IDENTIFICATIONS,
  createFakeGoogle,
  createFakeIdentifier,
  defaultExports,
} from '../src/profile/google-portability/fixtures/fake-google.js';
import { mapGoogleRecord } from '../src/profile/google-portability/mapper.js';
import type { GoogleRecord } from '../src/profile/google-portability/schemas.js';
import { recordIdOf, syncPortability } from '../src/profile/google-portability/sync.js';
import { createAdapterRegistry } from '../src/registry.js';

const USER = '10000000-0000-4000-a000-0000000000cc';
const CONNECTION = '20000000-0000-4000-a000-000000000003';
const noSleep = async () => undefined;
const ctx = { userId: USER, connectionId: CONNECTION, source: 'google_portability' as const };

function setup(options: Parameters<typeof createFakeGoogle>[0] = {}) {
  const google = createFakeGoogle(options);
  const client = new GooglePortabilityClient({ ...FAKE_CLIENT, fetchImpl: google.fetchImpl, sleep: noSleep });
  return { google, client };
}

async function connect(google: ReturnType<typeof createFakeGoogle>, client: GooglePortabilityClient) {
  const start = startPortabilityConnect(client, PHASE3_RESOURCE_GROUPS, { userId: USER, state: 'estado-de-prueba-0123456789' });
  if (start.kind !== 'redirect') throw new Error('se esperaba redirección');
  const code = google.approve(start.url);
  const done = await completePortabilityConnect(client, PHASE3_RESOURCE_GROUPS, {
    userId: USER,
    redirectUri: FAKE_CLIENT.redirectUri,
    callbackParams: { code, state: 'estado-de-prueba-0123456789' },
    pending: start.pending!,
  });
  if (done.kind !== 'connected') throw new Error('se esperaba conexión');
  return done;
}

function syncContext(credentials: SourceCredentials, now = new Date()): SyncContext & { saved: SourceCredentials[] } {
  const saved: SourceCredentials[] = [];
  const context = {
    connection: { id: CONNECTION, userId: USER, sourceKey: 'google_portability' as const, status: 'active' as const, cursor: null },
    credentials,
    cursor: null,
    pageSize: 50,
    now,
    saved,
    saveState: async (patch: SourceCredentials) => {
      Object.assign(credentials, patch);
      saved.push({ ...patch });
    },
  };
  return context;
}

describe('autorización de Google Data Portability', () => {
  it('pide solo los scopes de Data Portability, acceso offline, PKCE y el state, sin include_granted_scopes', () => {
    const { client } = setup();
    const start = startPortabilityConnect(client, PHASE3_RESOURCE_GROUPS, { userId: USER, state: 'estado-0123456789abcdef' });
    expect(start.kind).toBe('redirect');
    const url = new URL((start as { url: string }).url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')!.split(' ')).toEqual(PHASE3_RESOURCE_GROUPS.map((g) => `https://www.googleapis.com/auth/dataportability.${g}`));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('estado-0123456789abcdef');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.has('include_granted_scopes')).toBe(false);
    expect(url.searchParams.get('redirect_uri')).toBe(FAKE_CLIENT.redirectUri);
    // La URL de vuelta es localhost: en desarrollo el consentimiento se hace en el navegador del PC.
    expect(start).toMatchObject({ localOnly: true, pending: { codeVerifier: expect.any(String) } });
  });

  it('canjea el código con PKCE y guarda solo el refresh token y los grupos concedidos', async () => {
    const { google, client } = setup({ grantedGroups: ['maps.reviews', 'search_ugc.media.thumbs'] });
    const done = await connect(google, client);
    expect(done.credentials).toMatchObject({ refreshToken: expect.stringMatching(/^refresh-simulado-/), jobs: '{}', exportedAt: '{}' });
    expect(JSON.parse(done.credentials!.groups!)).toEqual(['maps.reviews', 'search_ugc.media.thumbs']);
    expect(done.externalAccountRef).toBeUndefined();
    expect(done.scopes).toHaveLength(2);
  });

  it('rechaza un acceso cancelado, una respuesta sin código o un consentimiento sin datos marcados', async () => {
    const { google, client } = setup({ grantedGroups: [] });
    const base = { userId: USER, redirectUri: FAKE_CLIENT.redirectUri, pending: { codeVerifier: 'x'.repeat(50) } };
    await expect(completePortabilityConnect(client, PHASE3_RESOURCE_GROUPS, { ...base, callbackParams: { error: 'access_denied' } })).rejects.toMatchObject({
      code: 'verification_failed',
      message: expect.stringMatching(/cancel/),
    });
    await expect(completePortabilityConnect(client, PHASE3_RESOURCE_GROUPS, { ...base, callbackParams: {} })).rejects.toMatchObject({ code: 'verification_failed' });
    await expect(connect(google, client)).rejects.toMatchObject({ message: expect.stringMatching(/ningún dato/) });
    expect(google.revoked).toHaveLength(1);
  });
});

describe('archivo exportado', () => {
  const zipOf = (files: Record<string, unknown>) => zipSync(Object.fromEntries(Object.entries(files).map(([p, d]) => [p, strToU8(JSON.stringify(d))])));

  it('lee reseñas de Maps (GeoJSON) sin guardar su texto y descarta lugares sin coordenadas', () => {
    const { records, summary } = readArchive('maps.reviews', [zipOf(defaultExports()['maps.reviews']!)]);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ group: 'maps.reviews', rating: 5, hasText: true, place: { name: 'Museu Picasso', latitude: 41.38522, longitude: 2.18101, countryCode: 'ES' } });
    expect(JSON.stringify(records)).not.toContain('NO debe guardarse');
    expect(summary).toMatchObject({
      records: 3,
      skipped: 1,
      skippedReasons: { sin_coordenadas: 1 },
      files: [{ path: 'Portability/Maps (your places)/Reviews.json' }],
    });
  });

  it('admite el envoltorio properties de Takeout para los sitios guardados', () => {
    const { records } = readArchive('maps.starred_places', [zipOf(defaultExports()['maps.starred_places']!)]);
    expect(records).toEqual([
      {
        group: 'maps.starred_places',
        place: expect.objectContaining({ name: 'Sagrada Família', latitude: 41.40364, mapsUrl: 'https://maps.google.com/?cid=4444444444444444444' }),
        date: '2026-03-03T09:00:00.000Z',
      },
    ]);
  });

  it('lee las valoraciones de la Búsqueda con sus claves documentadas y su fecha', () => {
    const thumbs = readArchive('search_ugc.media.thumbs', [zipOf(defaultExports()['search_ugc.media.thumbs']!)]);
    expect(thumbs.records.map((r) => (r as { thumb: string }).thumb)).toEqual(['up', 'down', 'up']);
    const stars = readArchive('search_ugc.media.reviews_and_stars', [zipOf(defaultExports()['search_ugc.media.reviews_and_stars']!)]);
    expect(stars.records[0]).toEqual({ group: 'search_ugc.media.reviews_and_stars', query: 'Breaking Bad', stars: 5, date: '2026-02-02T20:00:00.000Z' });
  });

  it('el resumen de estructura no contiene datos personales', () => {
    const { summary } = readArchive('maps.reviews', [zipOf(defaultExports()['maps.reviews']!)]);
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/Picasso|Culleretes|1111111111|1ed6b4bc|12a4a2f7/);
    expect(summary.urlPatterns).toEqual(['maps.google.com/?cid=…', 'www.google.com/maps/place//data=!#m#!#m#!#s0x…:0x…']);
    expect(summary.enumValues).toEqual({});
  });

  it('obtiene el CID de Google del enlace de Maps en sus distintos formatos', () => {
    expect(googlePlaceIds('https://www.google.com/maps/place//data=!4m2!3m1!1s0x12a4a2f7a1b2c3d4:0x1ed6b4bc2b0bd2e7')).toEqual({ cid: '2222162186422964967' });
    expect(googlePlaceIds('https://maps.google.com/?cid=1111111111111111111')).toEqual({ cid: '1111111111111111111' });
    expect(googlePlaceIds('https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJabcdefghijklmnop')).toEqual({ placeId: 'ChIJabcdefghijklmnop' });
    expect(googlePlaceIds('https://www.google.com/maps/place//data=!4m2!3m1!1s0x0:0x0')).toEqual({});
    expect(googlePlaceIds(undefined)).toEqual({});
    // El registro usa el CID y la observación lo añade como identificador del lugar.
    const record = { group: 'maps.reviews' as const, place: { name: 'Can Culleretes', latitude: 41.38, longitude: 2.17, mapsUrl: 'https://www.google.com/maps/place//data=!4m2!3m1!1s0x12a4a2f7a1b2c3d4:0x1ed6b4bc2b0bd2e7' }, rating: 4, hasText: false };
    expect(recordIdOf(record)).toBe('place:cid:2222162186422964967');
    const [o] = mapGoogleRecord({ recordId: recordIdOf(record), record, identified: FAKE_IDENTIFICATIONS['Restaurante Can Culleretes']! }, ctx);
    expect(o!.externalItem.canonicalIds).toEqual({ 'osm:node': '1000000001', 'google_maps:cid': '2222162186422964967' });
  });

  it('interpreta las estrellas escritas o numéricas y rechaza lo demás', () => {
    expect([parseStars('Five stars'), parseStars('One star'), parseStars('4 estrellas'), parseStars(3), parseStars('Six stars'), parseStars(0)]).toEqual([5, 1, 4, 3, null, null]);
    expect(urlPattern('https://www.google.com/maps/place/?q=place_id:ChIJabcdefghijklmnopqrstuvwxyz123')).toBe('www.google.com/maps/place/?q=…');
  });
});

describe('sync de Google', () => {
  it('inicia un export por grupo, guarda su id cifrado y espera mientras Google lo prepara', async () => {
    const { google, client } = setup({ pollsBeforeComplete: 1 });
    const done = await connect(google, client);
    const { identifier } = createFakeIdentifier();
    const context = syncContext({ ...done.credentials! });
    const first = await syncPortability(client, context, { identifier });
    expect(first.pending).toMatchObject({ retryAfterMs: 60_000 });
    expect(first.records).toHaveLength(0);
    expect(Object.keys(JSON.parse(context.credentials!.jobs!))).toHaveLength(5);
    expect(context.saved.length).toBeGreaterThan(0);

    const summaries: unknown[] = [];
    const second = await syncPortability(client, context, { identifier, onArchiveSummary: (s) => summaries.push(s) });
    expect(second.pending).toBeUndefined();
    expect(second.snapshotComplete).toBe(true);
    expect(second.snapshotKinds?.sort()).toEqual(['maps_review', 'maps_starred', 'search_rating', 'search_thumb', 'search_watched']);
    // 3 reseñas (una sin identificar) + 1 guardado + 2 estrellas + 3 pulgares (Moana sin identificar) + 1 visto.
    expect(second.records).toHaveLength(8);
    expect(second.partialErrors.filter((e) => e.code === 'unidentified').map((e) => e.blocking)).toEqual([false, false]);
    expect(summaries).toHaveLength(5);
    expect(JSON.parse(context.credentials!.jobs!)).toEqual({});
  });

  it('no repite un export antes de 24 h y respeta el acceso único', async () => {
    const { google, client } = setup({ oneTimeGroups: ['maps.reviews'] });
    const done = await connect(google, client);
    const { identifier } = createFakeIdentifier();
    const context = syncContext({ ...done.credentials! });
    await syncPortability(client, context, { identifier });
    const again = await syncPortability(client, context, { identifier });
    expect(again).toMatchObject({ records: [], snapshotComplete: false, snapshotKinds: [] });
    expect(google.calls.filter((c) => c.endsWith(':initiate'))).toHaveLength(5);

    // Pasadas 24 h, los grupos temporales se vuelven a exportar; el de acceso único ya no.
    google.allowNewExports();
    const later = await syncPortability(client, syncContext(context.credentials!, new Date(Date.now() + 25 * 3600_000)), { identifier });
    expect(later.snapshotKinds?.sort()).toEqual(['maps_starred', 'search_rating', 'search_thumb', 'search_watched']);
  });

  it('reintenta un export fallido', async () => {
    const { google, client } = setup({ failOnce: ['search_ugc.media.watched'] });
    const done = await connect(google, client);
    const { identifier } = createFakeIdentifier();
    const context = syncContext({ ...done.credentials! });
    const first = await syncPortability(client, context, { identifier });
    expect(first.pending).toMatchObject({ retryAfterMs: 60_000 });
    expect(google.calls.some((c) => c.endsWith(':retry'))).toBe(true);
    const second = await syncPortability(client, context, { identifier });
    expect(second.snapshotKinds).toContain('search_watched');
  });

  it('si el catálogo (OSM o Wikidata) no responde, el sync se aplaza sin perder los exports', async () => {
    const { google, client } = setup();
    const done = await connect(google, client);
    const unavailable = async (): Promise<never> => {
      throw new SourceError('unavailable', 'OpenStreetMap (Overpass) no responde; se reintentará', true);
    };
    const failing = { identifyPlace: unavailable, identifyPlaces: unavailable, identifyWork: async () => null };
    const context = syncContext({ ...done.credentials! });
    const progress: string[] = [];
    const deferred = await syncPortability(client, context, { identifier: failing, onProgress: (m) => progress.push(m) });
    expect(deferred.pending).toMatchObject({ retryAfterMs: 600_000, reason: expect.stringMatching(/Overpass/) });
    expect(progress).toContainEqual(expect.stringMatching(/^maps\.reviews: identificando \d+ lugares con OpenStreetMap$/));
    // Los trabajos siguen guardados: el siguiente intento vuelve a descargar los mismos exports.
    expect(Object.keys(JSON.parse(context.credentials!.jobs!))).toHaveLength(5);
    const { identifier } = createFakeIdentifier();
    const resumed = await syncPortability(client, context, { identifier });
    expect(resumed.records).toHaveLength(8);
    expect(google.calls.filter((c) => c.endsWith(':initiate'))).toHaveLength(5);
  });

  it('un permiso caducado o revocado pide renovar (no reintentable)', async () => {
    const { google, client } = setup();
    const done = await connect(google, client);
    google.refreshTokens.clear();
    const { identifier } = createFakeIdentifier();
    await expect(syncPortability(client, syncContext({ ...done.credentials! }), { identifier })).rejects.toMatchObject({
      code: 'auth',
      retryable: false,
      message: expect.stringMatching(/renuévalo/),
    });
  });
});

describe('mapper google-portability-v1', () => {
  const place = { name: 'Museu Picasso', latitude: 41.38522, longitude: 2.18101, mapsUrl: 'https://maps.google.com/?cid=1111111111111111111' };
  const rec = (record: GoogleRecord['record'], name: string): GoogleRecord => ({ recordId: recordIdOf(record), record, identified: FAKE_IDENTIFICATIONS[name]! });
  const map = (r: GoogleRecord) => mapGoogleRecord(r, ctx).map((o) => parseObservation(o));

  it('reseña de Maps con estrellas: valoración explícita (r − 3) / 2 con fecha, ponderada por la identificación', () => {
    const [o] = map(rec({ group: 'maps.reviews', place, rating: 5, hasText: true, date: '2026-05-10T19:30:00.000Z' }, 'Museu Picasso'));
    expect(o).toMatchObject({
      sourceRecordId: 'place:cid:1111111111111111111',
      observationKind: 'maps_review',
      category: 'culture',
      knownConfidence: 0.95,
      consumedConfidence: 0.95,
      preferenceScore: 1,
      preferenceConfidence: 0.95,
      preferenceBasis: 'explicit_rating',
      occurredAt: '2026-05-10T19:30:00.000Z',
      timestampPrecision: 'instant',
      externalItem: { itemType: 'museum', canonicalIds: { 'osm:way': '25374958', 'wikidata:entity': 'Q368277' } },
    });
    expect(map(rec({ group: 'maps.reviews', place, rating: 2, hasText: false }, 'Museu Picasso'))[0]!.preferenceScore).toBe(-0.5);
    expect(JSON.stringify(o)).not.toContain('review_text');
  });

  it('guardado en Maps: conocido sin consumo ni preferencia', () => {
    expect(map(rec({ group: 'maps.starred_places', place }, 'Sagrada Família'))[0]).toMatchObject({
      observationKind: 'maps_starred',
      consumedConfidence: 0,
      preferenceScore: null,
      preferenceBasis: null,
    });
  });

  it('Búsqueda: estrellas explícitas, pulgares ±0,8 y «visto» sin preferencia', () => {
    expect(map(rec({ group: 'search_ugc.media.reviews_and_stars', query: 'Breaking Bad', stars: 5 }, 'Breaking Bad'))[0]).toMatchObject({
      category: 'series',
      sourceRecordId: 'work:breaking bad',
      preferenceScore: 1,
      preferenceConfidence: 0.8,
      externalItem: { attributes: { releaseYear: 2008 } },
    });
    expect(map(rec({ group: 'search_ugc.media.thumbs', query: 'Hades', thumb: 'down' }, 'Hades'))[0]).toMatchObject({
      category: 'games',
      preferenceScore: -0.8,
      preferenceConfidence: 0.585,
      consumedConfidence: 0.455,
      preferenceBasis: 'explicit_like',
    });
    expect(map(rec({ group: 'search_ugc.media.watched', query: 'Casablanca' }, 'Casablanca'))[0]).toMatchObject({
      knownConfidence: 0.65,
      consumedConfidence: 0.65,
      preferenceScore: null,
    });
  });
});

describe('identificación en el catálogo', () => {
  const element = (id: number, tags: Record<string, string>, lat = 41.3852, lon = 2.1810) => ({ type: 'node' as const, id, lat, lon, tags });

  it('OSM: nombre idéntico o sin palabras genéricas a ≤ 100 m, clasificado por sus etiquetas', () => {
    const place = { name: 'Restaurante Can Culleretes', latitude: 41.3813, longitude: 2.174 };
    expect(pickPlace(place, [element(1, { name: 'Can Culleretes', amenity: 'restaurant' }, 41.3813, 2.1741)])).toMatchObject({
      category: 'food',
      itemType: 'restaurant',
      canonicalIds: { 'osm:node': '1' },
      confidence: 0.85,
    });
    expect(pickPlace({ name: 'Museu Picasso', latitude: 41.3852, longitude: 2.181 }, [element(2, { name: 'Museu Picasso', tourism: 'museum', wikidata: 'Q368277' })])).toMatchObject({
      category: 'culture',
      canonicalIds: { 'osm:node': '2', 'wikidata:entity': 'Q368277' },
      confidence: 0.95,
    });
  });

  it('OSM: el nombre de Google contenido en el de OSM solo vale si el candidato es único o el único notable', () => {
    const place = { name: 'Sagrada Família', latitude: 41.4036, longitude: 2.1744 };
    // Caso real (OSM, 2026-10-09): la basílica es un monumento patrimonial; las estaciones homónimas no se clasifican.
    const basilica = { type: 'relation' as const, id: 9194723, center: { lat: 41.4036, lon: 2.1744 }, tags: { name: 'Basílica de la Sagrada Família', amenity: 'place_of_worship', tourism: 'attraction', historic: 'church', heritage: '1', wikidata: 'Q48435' } };
    const museum = element(4553142274, { name: 'Museu de la Sagrada Família', tourism: 'museum' }, 41.4037, 2.1745);
    const metro = element(462295964, { name: 'Sagrada Família', wikidata: 'Q2548808' });
    expect(pickPlace(place, [basilica, museum, metro])).toMatchObject({
      category: 'culture',
      itemType: 'venue',
      canonicalIds: { 'osm:relation': '9194723', 'wikidata:entity': 'Q48435' },
      confidence: 0.7,
      method: 'osm_nombre_contenido_100m',
    });
    // Dos candidatos por contención y ninguno (o ambos) notables → ambiguo.
    expect(pickPlace(place, [museum, element(9, { name: 'Escoles de la Sagrada Família', tourism: 'museum' })])).toBeNull();
    // Un nombre de una sola palabra no se busca por contención (demasiado ambiguo).
    expect(pickPlace({ name: 'Picasso', latitude: 41.3852, longitude: 2.181 }, [element(2, { name: 'Fundació Picasso Barcelona', tourism: 'museum' })])).toBeNull();
    // En cambio, quitar una palabra genérica sí identifica («Picasso» ≈ «Museu Picasso»).
    expect(pickPlace({ name: 'Picasso', latitude: 41.3852, longitude: 2.181 }, [element(2, { name: 'Museu Picasso', tourism: 'museum' })])).toMatchObject({ confidence: 0.85 });
  });

  it('OSM: sin coincidencia, fuera de las categorías o ambiguo → no identifica', () => {
    const place = { name: 'Can Pep', latitude: 41.38, longitude: 2.17 };
    expect(pickPlace(place, [element(1, { name: 'Can Pepe', amenity: 'restaurant' })])).toBeNull();
    expect(pickPlace(place, [element(1, { name: 'Can Pep', shop: 'hardware' })])).toBeNull();
    expect(pickPlace(place, [element(1, { name: 'Can Pep', amenity: 'restaurant' }), element(2, { name: 'Can Pep', tourism: 'museum' })])).toBeNull();
    expect(classifyOsmTags({ amenity: 'cinema' })).toEqual({ category: 'culture', itemType: 'venue' });
  });

  /** Respuesta de Overpass a una consulta por lotes: separador `make sep` antes de los elementos de cada lugar. */
  const batchResponse = (groups: Array<Array<ReturnType<typeof element>>>) =>
    new Response(JSON.stringify({ elements: groups.flatMap((els, i) => [{ type: 'sep', id: i + 1, tags: { i: String(i) } }, ...els]) }));
  const museum = () => element(7, { name: 'Museu Picasso', tourism: 'museum' });

  it('OSM: ante un 429 espera al hueco libre que indica /api/status; ante un 504, espera creciente', async () => {
    const calls: string[] = [];
    const slept: number[] = [];
    const logs: string[] = [];
    const replies = [429, 504];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url.endsWith('/status') ? 'status' : 'query');
      if (url.endsWith('/status')) {
        return new Response('Rate limit: 4\n0 slots available now.\nSlot available after: 2026-10-09T09:19:51Z, in 24 seconds.\nSlot available after: 2026-10-09T09:19:54Z, in 27 seconds.\n');
      }
      const status = replies.shift();
      return status ? new Response('ocupado', { status }) : batchResponse([[museum()]]);
    }) as typeof fetch;
    const osm = new OsmPlaceIdentifier({ userAgent: 'x', fetchImpl, sleep: async (ms) => void slept.push(ms), minIntervalMs: 0, log: (m) => logs.push(m) });
    await expect(osm.identifyPlace({ name: 'Museu Picasso', latitude: 41.3852, longitude: 2.181 })).resolves.toMatchObject({ category: 'culture' });
    expect(calls).toEqual(['query', 'status', 'query', 'query']);
    // 429: lo que pide /api/status (25 s) si supera la espera base (15 s); 504: espera base del 2.º reintento (30 s).
    expect(slept).toEqual([25_000, 30_000]);
    expect(logs).toEqual([expect.stringContaining('HTTP 429'), expect.stringContaining('HTTP 504')]);
    expect(slotWaitMs('Rate limit: 4\n2 slots available now.\n')).toBe(1_000);
    expect(slotWaitMs('ilegible')).toBe(30_000);
  });

  it('OSM: agrupa los lugares en lotes, reparte por separador y repite una respuesta incompleta', async () => {
    const bodies: string[] = [];
    let truncated = true;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const query = new URLSearchParams(String(init?.body)).get('data')!;
      bodies.push(query);
      const size = query.match(/make sep/g)!.length;
      // Cada lugar i del lote solo tiene cerca el museo «Museo i»; la primera respuesta llega sin el último separador.
      const offset = bodies.length > 2 ? 3 : 0;
      const groups = Array.from({ length: size }, (_, i) => [element(100 + i, { name: `Museo ${offset + i}`, tourism: 'museum' })]);
      if (truncated) {
        truncated = false;
        return batchResponse(groups.slice(0, -1));
      }
      return batchResponse(groups);
    }) as typeof fetch;
    const progress: string[] = [];
    const osm = new OsmPlaceIdentifier({ userAgent: 'x', fetchImpl, sleep: noSleep, minIntervalMs: 0, batchSize: 3 });
    const places = Array.from({ length: 5 }, (_, i) => ({ name: `Museo ${i}`, latitude: 41.38 + i / 1000, longitude: 2.18 }));
    const results = await osm.identifyPlaces([...places, places[0]!], (done, total) => progress.push(`${done}/${total}`));
    // 2 lotes (3 + 2 lugares; el repetido sale de la caché) y un reintento del primero por faltar un separador.
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toContain('around:100,41.38,2.18');
    expect(results.map((r) => r?.canonicalIds['osm:node'])).toEqual(['100', '101', '102', '100', '101', '100']);
    expect(progress).toEqual(['4/6', '6/6']);
  });

  it('OSM: consulta Overpass con User-Agent y cachea el resultado', async () => {
    const calls: Array<{ ua: string | null; body: string }> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ ua: new Headers(init?.headers).get('user-agent'), body: String(init?.body) });
      return batchResponse([[museum()]]);
    }) as typeof fetch;
    const osm = new OsmPlaceIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: noSleep, minIntervalMs: 0 });
    const place = { name: 'Museu Picasso', latitude: 41.3852, longitude: 2.181 };
    await expect(osm.identifyPlace(place)).resolves.toMatchObject({ category: 'culture' });
    await osm.identifyPlace(place);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.ua).toBe('APPINITY-test');
    expect(decodeURIComponent(calls[0]!.body)).toContain('around:100,41.3852,2.181');
  });

  /** Wikidata simulado: búsqueda por etiqueta y entidades con P31, P175, P577 y enlaces. */
  function fakeWikidata(search: Record<string, Array<{ id: string; label: string }>>, entities: Record<string, unknown>) {
    return (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.searchParams.get('action') === 'wbsearchentities') {
        return new Response(JSON.stringify({ search: (search[url.searchParams.get('search')!] ?? []).map((s) => ({ ...s, match: { type: 'label', text: s.label } })) }));
      }
      const ids = url.searchParams.get('ids')!.split('|');
      return new Response(JSON.stringify({ entities: Object.fromEntries(ids.map((id) => [id, entities[id] ?? { missing: '' }])) }));
    }) as typeof fetch;
  }
  const claim = (id: string) => ({ mainsnak: { datavalue: { value: { id } } } });
  const time = (t: string) => ({ mainsnak: { datavalue: { value: { time: t } } } });
  const sitelinks = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`wiki${i}`, {}]));

  it('Wikidata: candidato único con tipo reconocido → identificado con su año', async () => {
    const fetchImpl = fakeWikidata(
      { 'Breaking Bad': [{ id: 'Q1079', label: 'Breaking Bad' }, { id: 'Q999', label: 'Breaking Bad (song)' }] },
      { Q1079: { claims: { P31: [claim('Q5398426')], P580: [time('+2008-01-20T00:00:00Z')] }, labels: { es: { value: 'Breaking Bad' } }, sitelinks: sitelinks(80) } },
    );
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: noSleep });
    await expect(wd.identifyWork({ title: 'Breaking Bad' })).resolves.toMatchObject({
      category: 'series',
      itemType: 'series',
      canonicalIds: { 'wikidata:entity': 'Q1079' },
      releaseYear: 2008,
      confidence: 0.8,
    });
  });

  it('Wikidata: varios candidatos parecidos en popularidad → no identifica; uno dominante → confianza 0,65', async () => {
    const search = { Moana: [{ id: 'Q1', label: 'Moana' }, { id: 'Q2', label: 'Moana' }] };
    const tied = fakeWikidata(search, {
      Q1: { claims: { P31: [claim('Q11424')] }, sitelinks: sitelinks(60) },
      Q2: { claims: { P31: [claim('Q11424')] }, sitelinks: sitelinks(40) },
    });
    await expect(new WikidataWorkIdentifier({ userAgent: 'x', fetchImpl: tied, sleep: noSleep }).identifyWork({ title: 'Moana' })).resolves.toBeNull();
    const dominant = fakeWikidata(search, {
      Q1: { claims: { P31: [claim('Q11424')] }, labels: { es: { value: 'Vaiana' } }, sitelinks: sitelinks(90) },
      Q2: { claims: { P31: [claim('Q482994')] }, sitelinks: sitelinks(10) },
    });
    await expect(new WikidataWorkIdentifier({ userAgent: 'x', fetchImpl: dominant, sleep: noSleep }).identifyWork({ title: 'Moana' })).resolves.toMatchObject({
      category: 'movies',
      title: 'Vaiana',
      confidence: 0.65,
    });
  });

  it('Wikidata: un disco se atribuye a su único intérprete; un tipo no reconocido no identifica', async () => {
    const fetchImpl = fakeWikidata(
      { 'OK Computer': [{ id: 'Q213', label: 'OK Computer' }], Paris: [{ id: 'Q90', label: 'Paris' }] },
      {
        Q213: { claims: { P31: [claim('Q208569')], P175: [claim('Q44190')] }, sitelinks: sitelinks(70) },
        Q44190: { labels: { es: { value: 'Radiohead' } } },
        Q90: { claims: { P31: [claim('Q515')] }, sitelinks: sitelinks(300) },
      },
    );
    const wd = new WikidataWorkIdentifier({ userAgent: 'x', fetchImpl, sleep: noSleep });
    await expect(wd.identifyWork({ title: 'OK Computer' })).resolves.toMatchObject({
      category: 'music',
      itemType: 'artist',
      title: 'Radiohead',
      canonicalIds: { 'wikidata:entity': 'Q44190' },
    });
    await expect(wd.identifyWork({ title: 'Paris' })).resolves.toBeNull();
  });
});

describe('registro con Google', () => {
  it('sin cliente OAuth aparece «sin configurar»; con él, conectable y renovable', () => {
    expect(createAdapterRegistry({ demoMode: false }).manifests().find((m) => m.key === 'google_portability')).toMatchObject({
      availability: 'unconfigured',
      connectable: false,
    });
    const registry = createAdapterRegistry({ demoMode: false, google: FAKE_CLIENT });
    expect(registry.manifests().find((m) => m.key === 'google_portability')).toMatchObject({
      availability: 'available',
      connectable: true,
      supportsRenewal: true,
      authentication: 'oauth2',
    });
    expect(registry.manifests().filter((m) => m.key === 'google_portability')).toHaveLength(1);
  });
});
