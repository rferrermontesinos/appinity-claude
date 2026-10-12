import { parseObservation, type IdentifiedEntity, type Identification } from '@appinity/shared';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { WikidataWorkIdentifier } from '../src/catalog/wikidata-works.js';
import { readArchive } from '../src/profile/google-portability/archive.js';
import { YT_MAX_CHANNELS } from '../src/profile/google-portability/constants.js';
import { FAKE_CHANNELS, createFakeIdentifier, defaultExports } from '../src/profile/google-portability/fixtures/fake-google.js';
import { mapGoogleRecord } from '../src/profile/google-portability/mapper.js';
import type { GoogleRecord } from '../src/profile/google-portability/schemas.js';
import { parseCsv, processYouTube, type ChannelActivity } from '../src/profile/google-portability/youtube.js';

const USER = '10000000-0000-4000-a000-0000000000dd';
const zipOf = (files: Record<string, unknown>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([p, d]) => [p, strToU8(typeof d === 'string' ? d : JSON.stringify(d))])));

describe('YouTube: lectura del export', () => {
  it('CSV con comillas, comas, saltos de línea y BOM', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,"x, ""y""\nz"\r\n\r\n2,\n')).toEqual([
      { a: '1', b: 'x, "y"\nz' },
      { a: '2', b: '' },
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('Mi actividad: cuenta escuchas por canal; búsquedas, anuncios y vídeos sin canal no cuentan; no guarda títulos', () => {
    const { youtube, summary } = readArchive('myactivity.youtube', [zipOf(defaultExports()['myactivity.youtube']!)]);
    expect(youtube).toMatchObject({ group: 'myactivity.youtube' });
    const channels = (youtube as { channels: ChannelActivity[] }).channels;
    expect(channels.find((c) => c.channelId === FAKE_CHANNELS.radioheadTopic)).toEqual({
      channelId: FAKE_CHANNELS.radioheadTopic,
      title: 'Radiohead - Topic',
      plays: 4,
      musicPlays: 4,
      lastPlayed: '2026-09-04T20:00:00.000Z',
    });
    expect(channels.find((c) => c.channelId === FAKE_CHANNELS.radiohead)).toMatchObject({ plays: 2, musicPlays: 0 });
    expect(summary).toMatchObject({
      records: 8,
      skipped: 3,
      skippedReasons: { no_es_reproduccion: 1, anuncio: 1, sin_canal: 1 },
      enumValues: { header: ['YouTube', 'YouTube Music'] },
    });
    // El resumen no lleva títulos de vídeos, búsquedas ni nombres de canales.
    expect(JSON.stringify(summary)).not.toMatch(/simulad|Radiohead|search_query=simulada/);
  });

  it('suscripciones y biblioteca (CSV): canales por ID y canciones por artista (sin el sufijo «- Topic»)', () => {
    const subs = readArchive('youtube.subscriptions', [zipOf(defaultExports()['youtube.subscriptions']!)]);
    expect(subs.youtube).toEqual({
      group: 'youtube.subscriptions',
      channels: [
        { channelId: FAKE_CHANNELS.radiohead, title: 'Radiohead' },
        { channelId: FAKE_CHANNELS.vlog, title: 'Vlog simulado' },
      ],
    });
    const library = readArchive('youtube.music', [zipOf(defaultExports()['youtube.music']!)]);
    expect(library.youtube).toEqual({
      group: 'youtube.music',
      artists: [
        { name: 'Radiohead', songs: 2 },
        { name: 'Artista desconocido', songs: 1 },
      ],
    });
    expect(library.summary).toMatchObject({ records: 3, skippedReasons: { sin_artista: 1 } });
  });

  it('no descomprime lo que no lee (música subida, HTML)', () => {
    const { summary } = readArchive('youtube.music', [
      zipOf({ 'music uploads/cancion.mp3': 'x'.repeat(1000), 'music library songs.csv': 'Artist Name\nRadiohead\n' }),
    ]);
    expect(summary.files).toEqual(expect.arrayContaining([{ path: 'music uploads/cancion.mp3', bytes: 1000 }]));
    expect(summary.records).toBe(1);
  });
});

describe('YouTube: identificación y agregación', () => {
  it('fusiona los canales de un mismo artista y calcula el p95 del usuario por categoría', async () => {
    const { youtube } = readArchive('myactivity.youtube', [zipOf(defaultExports()['myactivity.youtube']!)]);
    const { identifier, calls } = createFakeIdentifier();
    const result = await processYouTube(youtube!, identifier);
    expect(result.records.map((r) => [r.recordId, r.record])).toEqual([
      ['wd:Q44190', { group: 'myactivity.youtube', plays: 6, musicPlays: 4, channels: 2, date: '2026-09-10T21:00:00.000Z' }],
      ['wd:Q999999999', { group: 'myactivity.youtube', plays: 1, musicPlays: 0, channels: 1, date: '2026-09-05T08:00:00.000Z' }],
    ]);
    // Prevalece la identificación por ID de canal (0,95) sobre la del nombre del «Topic» (0,8).
    expect(result.records[0]!.identified).toMatchObject({ confidence: 0.95, method: 'wikidata_canal_youtube' });
    expect(result.stats).toEqual({ yt_plays_p95_music: 6, yt_plays_p95_podcasts: 1 });
    expect(result.identifications.filter((i) => !i.entity)).toEqual([{ entity: null, reason: 'out_of_scope', scope: 'persona' }]);
    expect(calls.filter((c) => c.startsWith('channel:'))).toHaveLength(4);
  });

  it('solo consulta los canales más escuchados (máximo documentado) e informa del resto', async () => {
    const channels: ChannelActivity[] = Array.from({ length: YT_MAX_CHANNELS + 5 }, (_, i) => ({
      channelId: `UC${String(i).padStart(22, '0')}`,
      title: `Canal ${i}`,
      plays: i + 1,
      musicPlays: 0,
    }));
    const { identifier, calls } = createFakeIdentifier();
    const result = await processYouTube({ group: 'myactivity.youtube', channels }, identifier);
    expect(result).toMatchObject({ total: YT_MAX_CHANNELS + 5, beyondLimit: 5 });
    // Los 5 menos escuchados (1 a 5 escuchas) quedan fuera.
    expect(calls).not.toContain(`channel:UC${'0'.repeat(22)}`);
    expect(calls).toContain(`channel:UC${String(YT_MAX_CHANNELS + 4).padStart(22, '0')}`);
  });

  it('mapper: escuchas → consumido y preferencia por frecuencia desde 3; suscripción y biblioteca → conocido', () => {
    const artist: IdentifiedEntity = {
      category: 'music',
      itemType: 'artist',
      title: 'Radiohead',
      canonicalIds: { 'wikidata:entity': 'Q44190' },
      confidence: 0.95,
      method: 'wikidata_canal_youtube',
    };
    const context = { userId: USER, connectionId: '20000000-0000-4000-a000-0000000000dd', source: 'google_portability' as const, stats: { yt_plays_p95_music: 40 } };
    const map = (record: GoogleRecord['record']) => mapGoogleRecord({ recordId: 'wd:Q44190', record, identified: artist } satisfies GoogleRecord, context)[0]!;
    const many = map({ group: 'myactivity.youtube', plays: 12, musicPlays: 12, channels: 1, date: '2026-09-01T00:00:00.000Z' });
    expect(many).toMatchObject({ observationKind: 'yt_plays', consumedConfidence: 0.95, preferenceBasis: 'strong_behavior', preferenceConfidence: 0.57 });
    expect(many.preferenceScore).toBeCloseTo(Math.log1p(12) / Math.log1p(40), 4);
    expect(map({ group: 'myactivity.youtube', plays: 2, musicPlays: 2, channels: 1 })).toMatchObject({ preferenceScore: null, preferenceBasis: null });
    expect(map({ group: 'youtube.subscriptions', channels: 1 })).toMatchObject({ observationKind: 'yt_subscription', consumedConfidence: 0, preferenceScore: null });
    expect(map({ group: 'youtube.music', songs: 3 })).toMatchObject({ observationKind: 'ytm_library', consumedConfidence: 0, engagement: { type: 'saved', value: 3 } });
    for (const record of [many, map({ group: 'youtube.music', songs: 3 })]) expect(() => parseObservation(record)).not.toThrow();
  });
});

describe('Wikidata: canales de YouTube (P2397) y artistas por nombre', () => {
  type FakeEntity = { P31: string[]; P106?: string[]; P2397?: string[]; label: string; sitelinks?: number };
  function fakeWikidata(entities: Record<string, FakeEntity>, labelSearch: Record<string, string[]> = {}) {
    const requests: URL[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requests.push(url);
      const action = url.searchParams.get('action');
      if (action === 'query') {
        const wanted = [...url.searchParams.get('srsearch')!.matchAll(/P2397=(UC[\w-]{22})/g)].map((m) => m[1]);
        const hits = Object.entries(entities).filter(([, e]) => e.P2397?.some((c) => wanted.includes(c)));
        return new Response(JSON.stringify({ query: { search: hits.map(([q]) => ({ title: q })) } }));
      }
      if (action === 'wbsearchentities') {
        const search = url.searchParams.get('search')!;
        return new Response(JSON.stringify({ search: (labelSearch[search] ?? []).map((id) => ({ id, label: entities[id]!.label, match: { type: 'label', text: entities[id]!.label } })) }));
      }
      const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
      const out = Object.fromEntries(
        url.searchParams.get('ids')!.split('|').map((id) => {
          const e = entities[id]!;
          return [
            id,
            {
              id,
              labels: { es: { value: e.label } },
              sitelinks: Object.fromEntries(Array.from({ length: e.sitelinks ?? 10 }, (_, i) => [`w${i}`, {}])),
              claims: {
                P31: e.P31.map((q) => claim({ id: q })),
                ...(e.P106 ? { P106: e.P106.map((q) => claim({ id: q })) } : {}),
                ...(e.P2397 ? { P2397: e.P2397.map((c) => claim(c)) } : {}),
              },
            },
          ];
        }),
      );
      return new Response(JSON.stringify({ entities: out }));
    }) as typeof fetch;
    return { fetchImpl, requests };
  }

  const RADIOHEAD = 'UCq19-LqvG35A-30oyAiPiqA';
  const PODCAST = 'UCpodcastSimulado0000000';
  const YOUTUBER = 'UCyoutuberSimulado000000';
  const TOPIC = 'UCTopicRadiohead00000000';

  it('identifica artistas y podcasts por su canal; personas no músicas quedan fuera; «Topic» por nombre sin su ID', async () => {
    const { fetchImpl, requests } = fakeWikidata(
      {
        Q44190: { P31: ['Q5741069'], P2397: [RADIOHEAD], label: 'Radiohead', sitelinks: 100 },
        Q900: { P31: ['Q24634210'], P2397: [PODCAST], label: 'Podcast simulado' },
        Q901: { P31: ['Q5'], P106: ['Q17125263'], P2397: [YOUTUBER], label: 'Youtuber simulado' },
      },
      { Radiohead: ['Q44190'] },
    );
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined });
    const results: Identification[] = await wd.identifyChannels([
      { channelId: RADIOHEAD, title: 'Radiohead' },
      { channelId: PODCAST, title: 'Podcast simulado' },
      { channelId: YOUTUBER, title: 'Youtuber simulado' },
      { channelId: TOPIC, title: 'Radiohead - Topic', musicName: 'Radiohead' },
      { channelId: 'no-es-un-id', title: 'Raro' },
    ]);
    expect(results[0]).toMatchObject({
      entity: { category: 'music', itemType: 'artist', canonicalIds: { 'wikidata:entity': 'Q44190', 'youtube:channel': RADIOHEAD }, confidence: 0.95 },
    });
    expect(results[1]).toMatchObject({ entity: { category: 'podcasts', itemType: 'podcast', title: 'Podcast simulado' } });
    expect(results[2]).toEqual({ entity: null, reason: 'out_of_scope', scope: 'persona' });
    // El «Topic» no figura en Wikidata: se identifica el artista por nombre exacto, sin atribuirle el ID del canal.
    expect(results[3]).toMatchObject({ entity: { canonicalIds: { 'wikidata:entity': 'Q44190' }, confidence: 0.8, method: 'wikidata_nombre_artista_unico' } });
    expect(results[3]!.entity!.canonicalIds['youtube:channel']).toBeUndefined();
    expect(results[4]).toEqual({ entity: null, reason: 'no_match' });
    // Una sola búsqueda para todos los canales válidos, y la caché evita repetirla.
    expect(requests.filter((r) => r.searchParams.get('action') === 'query')).toHaveLength(1);
    await wd.identifyChannels([{ channelId: RADIOHEAD, title: 'Radiohead' }]);
    expect(requests.filter((r) => r.searchParams.get('action') === 'query')).toHaveLength(1);
  });

  it('artistas por nombre: solo músicos (no una película o un disco homónimos)', async () => {
    const { fetchImpl } = fakeWikidata(
      {
        Q1: { P31: ['Q11424'], label: 'Heroes' },
        Q2: { P31: ['Q482994'], label: 'Heroes' },
        Q3: { P31: ['Q5'], P106: ['Q177220'], label: 'Rosalía' },
      },
      { Heroes: ['Q1', 'Q2'], Rosalía: ['Q3'] },
    );
    const wd = new WikidataWorkIdentifier({ userAgent: 'APPINITY-test', fetchImpl, sleep: async () => undefined });
    const [heroes, rosalia] = await wd.identifyArtists(['Heroes', 'Rosalía']);
    expect(heroes).toEqual({ entity: null, reason: 'no_match' });
    expect(rosalia).toMatchObject({ entity: { category: 'music', itemType: 'artist', canonicalIds: { 'wikidata:entity': 'Q3' } } });
  });
});
