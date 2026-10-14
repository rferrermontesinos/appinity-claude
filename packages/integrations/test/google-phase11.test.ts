import { SourceError, parseObservation, type IdentifiedEntity, type SourceCredentials, type SyncContext } from '@appinity/shared';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { identifyPlacesByText } from '../src/catalog/identifier.js';
import { NominatimGeocoder, geocodeQueries } from '../src/catalog/nominatim.js';
import { WikidataWorkIdentifier } from '../src/catalog/wikidata-works.js';
import { readArchive } from '../src/profile/google-portability/archive.js';
import { completePortabilityConnect, startPortabilityConnect } from '../src/profile/google-portability/auth.js';
import { GooglePortabilityClient } from '../src/profile/google-portability/client.js';
import { PHASE11_RESOURCE_GROUPS } from '../src/profile/google-portability/constants.js';
import { FAKE_CLIENT, createFakeGoogle, createFakeIdentifier, defaultExports } from '../src/profile/google-portability/fixtures/fake-google.js';
import { mapGoogleRecord } from '../src/profile/google-portability/mapper.js';
import { isMapsUrl, mapsUrlInfo, playDocType, savedCsvBody } from '../src/profile/google-portability/play-orders-saved.js';
import type { ExportRecord, GoogleRecord } from '../src/profile/google-portability/schemas.js';
import { recordIdOf, syncPortability } from '../src/profile/google-portability/sync.js';

const USER = '10000000-0000-4000-a000-0000000000ee';
const CONNECTION = '20000000-0000-4000-a000-000000000011';
const zipOf = (files: Record<string, unknown>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([p, d]) => [p, strToU8(typeof d === 'string' ? d : JSON.stringify(d))])));
const read = (group: (typeof PHASE11_RESOURCE_GROUPS)[number]) => readArchive(group, [zipOf(defaultExports()[group]!)]);

describe('fase 11 · lectura del export', () => {
  it('biblioteca de Play: libros, apps con y sin ID de paquete; la música no se usa', () => {
    const { records, summary } = read('play.library');
    expect(records).toEqual([
      { group: 'play.library', title: 'Cien años de soledad', docType: 'book', date: '2025-03-01T10:00:00.000Z' },
      { group: 'play.library', title: 'Monument Valley', docType: 'app', packageName: 'com.ustwo.monumentvalley', date: '2025-04-01T10:00:00.000Z' },
      { group: 'play.library', title: 'WhatsApp Messenger', docType: 'app', date: '2024-01-01T10:00:00.000Z' },
    ]);
    expect(summary.skippedReasons).toEqual({ tipo_no_usado: 1 });
    // Los tipos vistos quedan en el resumen (sin datos personales) para contrastar con el primer export real.
    expect(summary.enumValues['doc.documentType']).toEqual(['Android Apps', 'Books', 'Music']);
    expect(playDocType('Audiobooks')).toBe('book');
    expect(playDocType('Movies')).toBe('movie');
    expect(playDocType('TV Shows')).toBe('series');
    expect(playDocType(undefined)).toBeNull();
  });

  it('pedidos y reservas: agregados por comercio; cancelados y reservas futuras no cuentan; sin platos ni importes', () => {
    const { records, summary } = read('order_reserve.purchases_reservations');
    expect(records).toEqual([
      {
        group: 'order_reserve.purchases_reservations',
        venue: { name: 'Restaurante Can Culleretes', address: 'Carrer d’en Quintana, 5, Barcelona' },
        orders: 2,
        reservations: 1,
        date: '2026-07-01T21:00:00.000Z',
      },
    ]);
    expect(summary.skippedReasons).toEqual({ pedido_cancelado: 1, reserva_futura: 1 });
    expect(JSON.stringify(records)).not.toMatch(/Plato simulado/);
  });

  it('colecciones guardadas: solo lugares de Maps, sin notas; la descripción de la colección se ignora', () => {
    const { records, summary } = read('saved.collections');
    expect(records).toEqual([
      {
        group: 'saved.collections',
        venue: { name: 'Sagrada Família' },
        lists: 1,
        mapsUrl: 'https://www.google.com/maps/place/Sagrada+Fam%C3%ADlia/data=!4m2!3m1!1s0x12a4a2dcd83dfb93:0x9bd8aac21bc3c950',
      },
    ]);
    expect(summary.skippedReasons).toEqual({ no_es_lugar: 1 });
    expect(JSON.stringify(records)).not.toMatch(/Nota privada/);
    expect(recordIdOf(records[0]!)).toBe(`place:cid:${BigInt('0x9bd8aac21bc3c950').toString()}`);
    expect(savedCsvBody('Descripción\n\nTitle,URL\nA,b')).toBe('Title,URL\nA,b');
    expect(savedCsvBody('Title,URL\nA,b')).toBe('Title,URL\nA,b');
  });

  it('enlaces de Maps: nombre y coordenadas si las trae', () => {
    expect(isMapsUrl('https://maps.app.goo.gl/abc')).toBe(true);
    expect(isMapsUrl('https://example.com/maps')).toBe(false);
    expect(mapsUrlInfo('https://www.google.com/maps/place/Bar+Pinotxo/@41.3817,2.1716,17z')).toEqual({ name: 'Bar Pinotxo', latitude: 41.3817, longitude: 2.1716 });
    expect(mapsUrlInfo('https://www.google.com/maps/search/41.40364,2.17428')).toEqual({ latitude: 41.40364, longitude: 2.17428 });
  });
});

describe('fase 11 · mapper', () => {
  const entity = (category: IdentifiedEntity['category'], itemType: string): IdentifiedEntity => ({
    category,
    itemType,
    title: 'X',
    canonicalIds: { 'wikidata:entity': 'Q1' },
    confidence: 0.9,
    method: 'test',
  });
  const map = (record: ExportRecord, identified: IdentifiedEntity, stats?: Record<string, number>) =>
    mapGoogleRecord({ recordId: recordIdOf(record), record, identified } satisfies GoogleRecord, { userId: USER, connectionId: CONNECTION, source: 'google_portability', ...(stats ? { stats } : {}) }).map((o) =>
      parseObservation(o),
    );

  it('Play: poseído (conocido), sin consumo ni preferencia', () => {
    const [o] = map({ group: 'play.library', title: 'Cien años de soledad', docType: 'book' }, entity('books', 'book'));
    expect(o).toMatchObject({ observationKind: 'play_library', knownConfidence: 0.9, consumedConfidence: 0, preferenceScore: null, engagement: { type: 'owned' } });
  });

  it('pedidos: consumido; desde 2 visitas, preferencia por frecuencia con base «attendance»', () => {
    const venue = { name: 'Bar' };
    const [once] = map({ group: 'order_reserve.purchases_reservations', venue, orders: 1, reservations: 0 }, entity('food', 'restaurant'));
    expect(once).toMatchObject({ consumedConfidence: 0.9, preferenceScore: null, preferenceBasis: null });
    const [often] = map({ group: 'order_reserve.purchases_reservations', venue, orders: 3, reservations: 1 }, entity('food', 'restaurant'), { food_visits_p95: 8 });
    expect(often).toMatchObject({ preferenceBasis: 'attendance', preferenceConfidence: 0.45, engagement: { type: 'attendance', value: 4 } });
    expect(often!.preferenceScore).toBeCloseTo(Math.log1p(4) / Math.log1p(8), 4);
  });

  it('guardados: conocido, no consumido, sin preferencia (guardar no prueba gusto); conserva el CID de Google', () => {
    const [o] = map(
      { group: 'saved.collections', venue: { name: 'Sagrada Família' }, lists: 2, mapsUrl: 'https://www.google.com/maps/place/x/data=!4m2!3m1!1s0x1:0x2' },
      entity('culture', 'venue'),
    );
    expect(o).toMatchObject({ observationKind: 'saved_place', consumedConfidence: 0, preferenceScore: null, engagement: { type: 'saved', value: 2 } });
    expect(o!.externalItem.canonicalIds?.['google_maps:cid']).toBe('2');
  });
});

describe('fase 11 · identificación', () => {
  it('lugares por texto: geocodificados pesan algo menos; sin resultado del geocodificador, sin coincidencia', async () => {
    const found = { name: 'Bar', latitude: 1, longitude: 2 };
    const results = await identifyPlacesByText(
      [{ name: 'Bar', address: 'Calle 1' }, { name: 'Inexistente' }],
      { geocode: async (p) => (p.name === 'Bar' ? { latitude: 1, longitude: 2, countryCode: 'ES' } : null) },
      async (points) => {
        expect(points).toEqual([{ ...found, countryCode: 'ES' }]);
        return [{ entity: { category: 'food', itemType: 'bar', title: 'Bar', canonicalIds: { 'osm:node': '1' }, confidence: 0.9, method: 'osm_exact_name_100m' } }];
      },
    );
    expect(results[0]).toMatchObject({ entity: { confidence: 0.81, method: 'geocodificado_osm_exact_name_100m' } });
    expect(results[1]).toEqual({ entity: null, reason: 'no_match', nearby: 'none' });
  });

  it('Nominatim: dirección y, si falla, nombre + ciudad; caché, país y reintento ante 429', async () => {
    const urls: URL[] = [];
    let calls = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      urls.push(url);
      calls++;
      if (calls === 1) return new Response('', { status: 429 });
      // La dirección no se encuentra; nombre + ciudad, sí.
      if (url.searchParams.get('q')!.startsWith('Carrer')) return new Response('[]');
      return new Response(JSON.stringify([{ lat: '41.38', lon: '2.17', address: { country_code: 'es' } }]));
    }) as typeof fetch;
    const geocoder = new NominatimGeocoder({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined, minIntervalMs: 0 });
    const place = { name: 'Can Culleretes', address: 'Carrer d’en Quintana, 5, 08002 Barcelona', countryCode: 'ES' };
    expect(geocodeQueries(place)).toEqual(['Carrer d’en Quintana, 5, 08002 Barcelona', 'Can Culleretes, Barcelona']);
    expect(await geocoder.geocode(place)).toEqual({ latitude: 41.38, longitude: 2.17, countryCode: 'ES' });
    expect(await geocoder.geocode(place)).toEqual({ latitude: 41.38, longitude: 2.17, countryCode: 'ES' });
    expect(calls).toBe(3);
    expect(urls.map((u) => u.searchParams.get('q'))).toEqual([place.address, place.address, 'Can Culleretes, Barcelona']);
    expect(urls[2]!.searchParams.get('countrycodes')).toBe('es');
    expect(geocodeQueries({ name: 'Bar X' })).toEqual(['Bar X']);
  });

  it('Nominatim caído: error reintentable (el sync se aplaza)', async () => {
    const geocoder = new NominatimGeocoder({
      userAgent: 'APPINITY-test',
      fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch,
      sleep: async () => undefined,
      minIntervalMs: 0,
    });
    await expect(geocoder.geocode({ name: 'Bar' })).rejects.toSatisfy((e) => e instanceof SourceError && e.retryable);
  });

  it('apps de Play por su ID (P3418): videojuego aceptado, otra app fuera de categoría, una búsqueda por lote', async () => {
    const entities: Record<string, { label: string; p31: string; pkg: string }> = {
      Q15553298: { label: 'Monument Valley', p31: 'Q7889', pkg: 'com.ustwo.monumentvalley' },
      Q1049511: { label: 'WhatsApp', p31: 'Q1209283', pkg: 'com.whatsapp' },
    };
    const requests: URL[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      requests.push(url);
      if (url.searchParams.get('action') === 'query') {
        const wanted = [...url.searchParams.get('srsearch')!.matchAll(/P3418=([\w.]+)/g)].map((m) => m[1]);
        return new Response(JSON.stringify({ query: { search: Object.entries(entities).filter(([, e]) => wanted.includes(e.pkg)).map(([q]) => ({ title: q })) } }));
      }
      const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
      const ids = url.searchParams.get('ids')!.split('|');
      return new Response(
        JSON.stringify({
          entities: Object.fromEntries(
            ids.map((id) => [id, { id, labels: { es: { value: entities[id]!.label } }, claims: { P31: [claim({ id: entities[id]!.p31 })], P3418: [claim(entities[id]!.pkg)] } }]),
          ),
        }),
      );
    }) as typeof fetch;
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined });
    const [game, app, unknown, invalid] = await wd.identifyApps(['com.ustwo.monumentvalley', 'com.whatsapp', 'com.desconocida.app', 'no es un id']);
    expect(game).toMatchObject({ entity: { category: 'games', title: 'Monument Valley', canonicalIds: { 'wikidata:entity': 'Q15553298' }, confidence: 0.95 } });
    expect(app).toEqual({ entity: null, reason: 'out_of_scope', scope: 'app' });
    expect(unknown).toEqual({ entity: null, reason: 'no_match' });
    expect(invalid).toEqual({ entity: null, reason: 'no_match' });
    expect(requests.filter((r) => r.searchParams.get('action') === 'query')).toHaveLength(1);
  });
});

describe('fase 11 · sync', () => {
  it('importa los tres grupos con el mismo consentimiento e informa de lo que no usa', async () => {
    const google = createFakeGoogle({ pollsBeforeComplete: 0 });
    const client = new GooglePortabilityClient({ ...FAKE_CLIENT, fetchImpl: google.fetchImpl, sleep: async () => undefined });
    const start = startPortabilityConnect(client, PHASE11_RESOURCE_GROUPS, { userId: USER, state: 'estado-de-prueba-0123456789' });
    if (start.kind !== 'redirect') throw new Error('se esperaba redirección');
    const done = await completePortabilityConnect(client, PHASE11_RESOURCE_GROUPS, {
      userId: USER,
      redirectUri: FAKE_CLIENT.redirectUri,
      callbackParams: { code: google.approve(start.url), state: 'estado-de-prueba-0123456789' },
      pending: start.pending!,
    });
    if (done.kind !== 'connected') throw new Error('se esperaba conexión');
    const credentials: SourceCredentials = { ...done.credentials! };
    const context: SyncContext = {
      connection: { id: CONNECTION, userId: USER, sourceKey: 'google_portability', status: 'active', cursor: null },
      credentials,
      cursor: null,
      pageSize: 50,
      now: new Date(),
      saveState: async (patch) => void Object.assign(credentials, patch),
    };
    const { identifier, calls } = createFakeIdentifier();
    const first = await syncPortability(client, context, { identifier });
    const batch = first.pending ? await syncPortability(client, context, { identifier }) : first;
    expect(batch.snapshotKinds?.sort()).toEqual(['food_order', 'play_library', 'saved_place']);
    const records = batch.records as GoogleRecord[];
    const of = (group: string) => records.filter((r) => r.record.group === group);
    expect(of('play.library').map((r) => r.identified.title).sort()).toEqual(['Cien años de soledad', 'Monument Valley']);
    expect(of('order_reserve.purchases_reservations')[0]).toMatchObject({ identified: { category: 'food', method: 'geocodificado_osm_name_sin_genericos_100m' } });
    expect(of('saved.collections')[0]).toMatchObject({ identified: { title: 'Sagrada Família' } });
    expect(batch.stats).toMatchObject({ food_visits_p95: 3 });
    // La app por ID; WhatsApp (sin ID) por título, limitado a videojuegos: fuera de categoría.
    expect(calls).toEqual(expect.arrayContaining(['app:com.ustwo.monumentvalley', 'work:WhatsApp Messenger', 'text:Restaurante Can Culleretes', 'text:Sagrada Família']));
    const unidentified = batch.partialErrors.filter((e) => e.code === 'unidentified').map((e) => e.message);
    expect(unidentified).toEqual([expect.stringMatching(/^1 de 3 objetos de la biblioteca de Google Play no se importan: 1 son apps que no son videojuegos fuera de las categorías de APPINITY \(app\)/)]);
  });
});
