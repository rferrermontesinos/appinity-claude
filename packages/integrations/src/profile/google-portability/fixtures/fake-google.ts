/**
 * Google SIMULADO para tests: OAuth 2.0 (token y revocación) y Data Portability API (initiate, estado, reintento, tipo de
 * acceso y reset) con exports ZIP generados al vuelo. Los formatos siguen la documentación oficial (2026-10-09); los
 * datos de usuario son inventados. Los lugares y títulos son reales y públicos.
 */
import type { ChannelToIdentify, IdentifiedEntity, Identification, PlaceIdentification } from '@appinity/shared';
import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';

export const FAKE_CLIENT = {
  clientId: '123456789012-simulado.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-simulado-no-es-real-0123456789',
  redirectUri: 'http://localhost:3100/v1/connect/google_portability/callback',
};

type Group = string;

/** Canales simulados. El de Radiohead es su canal oficial real (P2397 en Wikidata); el resto son inventados. */
export const FAKE_CHANNELS = {
  radiohead: 'UCq19-LqvG35A-30oyAiPiqA',
  radioheadTopic: 'UCTopicRadiohead00000000',
  podcast: 'UCpodcastSimulado0000000',
  vlog: 'UCvlogSimulado0000000000',
} as const;

/** Registro de Mi actividad (formato documentado). Los títulos van en el idioma de la cuenta: no se usan. */
const watch = (videoId: string, channelId: string, channel: string, time: string, header = 'YouTube') => ({
  header,
  title: `Has visto un vídeo simulado ${videoId}`,
  titleUrl: `https://${header === 'YouTube Music' ? 'music' : 'www'}.youtube.com/watch?v=${videoId}`,
  subtitles: [{ name: channel, url: `https://www.youtube.com/channel/${channelId}` }],
  time,
  products: [header],
  activityControls: ['YouTube watch history'],
});

/** Archivos del export por grupo (JSON o CSV tal como lo documenta Google; un texto se guarda tal cual). */
export function defaultExports(): Record<Group, Record<string, unknown>> {
  return {
    'maps.reviews': {
      'Portability/Maps (your places)/Reviews.json': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [2.18101, 41.38522] },
            date: '2026-05-10T19:30:00Z',
            google_maps_url: 'https://maps.google.com/?cid=1111111111111111111',
            location: [{ name: 'Museu Picasso', address: 'Carrer de Montcada, 15-23, Barcelona', country_code: 'ES' }],
            five_star_rating_published: 5,
            review_text_published: 'Texto simulado que NO debe guardarse',
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [2.17402, 41.38128] },
            date: '2026-07-02T14:00:00Z',
            // Formato visto en un export real (2026-10-09): /maps/place//data=…!1s0x<hex>:0x<CID en hex>.
            google_maps_url: 'https://www.google.com/maps/place//data=!4m2!3m1!1s0x12a4a2f7a1b2c3d4:0x1ed6b4bc2b0bd2e7',
            location: [{ name: 'Restaurante Can Culleretes', address: 'Carrer d’en Quintana, 5, Barcelona', country_code: 'ES' }],
            five_star_rating_published: 2,
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [2.15, 41.4] },
            date: '2026-01-01T10:00:00Z',
            google_maps_url: 'https://maps.google.com/?cid=3333333333333333333',
            location: [{ name: 'Ferretería simulada', address: 'Barcelona', country_code: 'ES' }],
            five_star_rating_published: 4,
          },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, location: [{ name: 'Sin coordenadas' }] },
        ],
      },
    },
    'maps.starred_places': {
      'Portability/Maps (your places)/Saved Places.json': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [2.17428, 41.40364] },
            properties: {
              date: '2026-03-03T09:00:00Z',
              google_maps_url: 'https://maps.google.com/?cid=4444444444444444444',
              location: { name: 'Sagrada Família', address: 'Carrer de Mallorca, 401, Barcelona', country_code: 'ES' },
            },
          },
        ],
      },
    },
    'search_ugc.media.reviews_and_stars': {
      'Portability/Search Contributions/Reviews.json': [
        { Published: '2026-02-01T20:00:00.000Z', 'Search Query': 'Breaking Bad', 'Review Star Rating': 'Five stars', 'Review Comment': 'Simulado', Updated: '2026-02-02T20:00:00.000Z' },
        { Published: '2026-04-11T20:00:00.000Z', 'Search Query': 'Casablanca', 'Review Star Rating': 'Two stars' },
      ],
    },
    'search_ugc.media.thumbs': {
      'Portability/Search Contributions/Thumbs.json': [
        { Published: '2026-06-01T10:00:00.000Z', 'Search Query': 'Hades', 'Thumbs Rating': 'Thumbs Up', Updated: '2026-06-01T10:00:00.000Z' },
        { Published: '2026-06-02T10:00:00.000Z', 'Search Query': 'Moana', 'Thumbs Rating': 'Thumbs Down' },
        { Published: '2026-06-03T10:00:00.000Z', 'Search Query': 'Radiohead', 'Thumbs Rating': 'Thumbs Up' },
      ],
    },
    'search_ugc.media.watched': {
      'Portability/Search Contributions/Watched.json': [{ Published: '2026-08-20T22:00:00.000Z', 'Search Query': 'Casablanca' }],
    },
    'myactivity.youtube': {
      'Portability/My Activity/YouTube/MyActivity.json': [
        // Radiohead: 4 escuchas en YouTube Music (canal «Topic») y 2 vídeos en su canal oficial → un solo artista, 6.
        ...['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa4'].map((v, i) =>
          watch(v, FAKE_CHANNELS.radioheadTopic, 'Radiohead - Topic', `2026-09-0${i + 1}T20:00:00.000Z`, 'YouTube Music'),
        ),
        watch('bbbbbbbbbb1', FAKE_CHANNELS.radiohead, 'Radiohead', '2026-09-10T21:00:00.000Z'),
        watch('bbbbbbbbbb2', FAKE_CHANNELS.radiohead, 'Radiohead', '2026-08-10T21:00:00.000Z'),
        watch('cccccccccc1', FAKE_CHANNELS.podcast, 'Podcast simulado', '2026-09-05T08:00:00.000Z'),
        watch('dddddddddd1', FAKE_CHANNELS.vlog, 'Vlog simulado', '2026-09-06T08:00:00.000Z'),
        // Búsqueda, anuncio y vídeo eliminado: no son escuchas válidas.
        { header: 'YouTube', title: 'Has buscado algo', titleUrl: 'https://www.youtube.com/results?search_query=simulada', time: '2026-09-07T08:00:00.000Z' },
        { ...watch('eeeeeeeeee1', FAKE_CHANNELS.vlog, 'Anunciante', '2026-09-08T08:00:00.000Z'), details: [{ name: 'From Google Ads' }] },
        { header: 'YouTube', title: 'Has visto un vídeo que se ha eliminado', titleUrl: 'https://www.youtube.com/watch?v=ffffffffff1', time: '2026-09-09T08:00:00.000Z' },
      ],
    },
    'youtube.subscriptions': {
      'Portability/YouTube and YouTube Music/subscriptions/subscriptions.csv': [
        'Channel ID,Channel URL,Channel Title',
        `${FAKE_CHANNELS.radiohead},http://www.youtube.com/channel/${FAKE_CHANNELS.radiohead},Radiohead`,
        `${FAKE_CHANNELS.vlog},http://www.youtube.com/channel/${FAKE_CHANNELS.vlog},Vlog simulado`,
        '',
      ].join('\r\n'),
    },
    'youtube.music': {
      'Portability/YouTube and YouTube Music/music (library and uploads)/music library songs.csv': [
        'Video ID,Song Title,Album Title,Artist Name',
        'gggggggggg1,Paranoid Android,OK Computer,Radiohead',
        'gggggggggg2,"Karma Police, versión simulada",OK Computer,Radiohead - Topic',
        'gggggggggg3,Canción simulada,Disco simulado,Artista desconocido',
        'gggggggggg4,Sin artista,,',
      ].join('\n'),
    },
    // Fase 11 (esquemas oficiales consultados el 2026-10-14; los nombres de archivo son supuestos hasta un export real).
    'play.library': {
      'Portability/Google Play Store/Library.json': [
        { libraryDoc: { doc: { documentType: 'Books', title: 'Cien años de soledad' }, acquisitionTime: '2025-03-01T10:00:00.000Z' } },
        { libraryDoc: { doc: { documentType: 'Android Apps', title: 'Monument Valley', docid: 'com.ustwo.monumentvalley' }, acquisitionTime: '2025-04-01T10:00:00.000Z' } },
        { libraryDoc: { doc: { documentType: 'Android Apps', title: 'WhatsApp Messenger' }, acquisitionTime: '2024-01-01T10:00:00.000Z' } },
        { libraryDoc: { doc: { documentType: 'Music', title: 'Disco simulado' }, acquisitionTime: '2024-02-01T10:00:00.000Z' } },
      ],
    },
    'order_reserve.purchases_reservations': {
      'Portability/Purchases & Reservations/Purchases.json': [
        { merchantOrderId: 'o-1', creationTime: '2026-05-01T20:00:00.000Z', orderStatus: 'COMPLETED', transactionMerchant: { name: 'Restaurante Can Culleretes' }, lineItem: [{ name: 'Plato simulado' }] },
        { merchantOrderId: 'o-2', creationTime: '2026-06-01T20:00:00.000Z', orderStatus: 'COMPLETED', transactionMerchant: { name: 'Restaurante Can Culleretes' } },
        { merchantOrderId: 'o-3', creationTime: '2026-06-02T20:00:00.000Z', orderStatus: 'CANCELLED', transactionMerchant: { name: 'Pizzería cancelada' } },
      ],
      'Portability/Purchases & Reservations/Reservations.json': [
        { uniqueId: 'r-1', merchantName: 'Restaurante Can Culleretes', address: 'Carrer d’en Quintana, 5, Barcelona', startTime: '2026-07-01T21:00:00.000Z', partySize: '2', canceled: 'false' },
        { uniqueId: 'r-2', merchantName: 'Reserva futura', startTime: '2099-01-01T21:00:00.000Z', canceled: 'false' },
      ],
    },
    'saved.collections': {
      'Portability/Saved/Quiero ir.csv': [
        'Lugares para visitar',
        '',
        'Title,Note,URL,Tags,Comment',
        'Sagrada Família,Nota privada,https://www.google.com/maps/place/Sagrada+Fam%C3%ADlia/data=!4m2!3m1!1s0x12a4a2dcd83dfb93:0x9bd8aac21bc3c950,,',
        'Artículo interesante,,https://example.com/articulo,,',
      ].join('\n'),
    },
  };
}

/** Identificaciones simuladas (equivalentes a lo que devolverían OSM y Wikidata). «Moana» y la ferretería: ninguna. */
export const FAKE_IDENTIFICATIONS: Record<string, IdentifiedEntity> = {
  'Museu Picasso': {
    category: 'culture',
    itemType: 'museum',
    title: 'Museu Picasso',
    canonicalIds: { 'osm:way': '25374958', 'wikidata:entity': 'Q368277' },
    location: { latitude: 41.38522, longitude: 2.18101, countryCode: 'ES' },
    confidence: 0.95,
    method: 'osm_exact_name_100m',
  },
  'Restaurante Can Culleretes': {
    category: 'food',
    itemType: 'restaurant',
    title: 'Restaurante Can Culleretes',
    canonicalIds: { 'osm:node': '1000000001' },
    location: { latitude: 41.38128, longitude: 2.17402, countryCode: 'ES' },
    confidence: 0.85,
    method: 'osm_name_sin_genericos_100m',
  },
  'Sagrada Família': {
    category: 'culture',
    itemType: 'venue',
    title: 'Sagrada Família',
    canonicalIds: { 'osm:way': '21070070', 'wikidata:entity': 'Q48435' },
    location: { latitude: 41.40364, longitude: 2.17428, countryCode: 'ES' },
    confidence: 0.95,
    method: 'osm_exact_name_100m',
  },
  'Breaking Bad': { category: 'series', itemType: 'series', title: 'Breaking Bad', canonicalIds: { 'wikidata:entity': 'Q1079' }, releaseYear: 2008, confidence: 0.8, method: 'wikidata_titulo_exacto_unico' },
  Casablanca: { category: 'movies', itemType: 'movie', title: 'Casablanca', canonicalIds: { 'wikidata:entity': 'Q132689' }, releaseYear: 1942, confidence: 0.65, method: 'wikidata_titulo_exacto_dominante' },
  Hades: { category: 'games', itemType: 'game', title: 'Hades', canonicalIds: { 'wikidata:entity': 'Q61949891' }, releaseYear: 2020, confidence: 0.65, method: 'wikidata_titulo_exacto_dominante' },
  Radiohead: { category: 'music', itemType: 'artist', title: 'Radiohead', canonicalIds: { 'wikidata:entity': 'Q44190' }, confidence: 0.8, method: 'wikidata_titulo_exacto_unico' },
  'Cien años de soledad': { category: 'books', itemType: 'book', title: 'Cien años de soledad', canonicalIds: { 'wikidata:entity': 'Q178869' }, releaseYear: 1967, confidence: 0.8, method: 'wikidata_titulo_exacto_unico' },
  'com.ustwo.monumentvalley': { category: 'games', itemType: 'game', title: 'Monument Valley', canonicalIds: { 'wikidata:entity': 'Q15553298' }, releaseYear: 2014, confidence: 0.95, method: 'wikidata_id_google_play' },
};

/** Identificación simulada de canales por su ID (lo que devolvería Wikidata con P2397). */
export const FAKE_CHANNEL_IDENTIFICATIONS: Record<string, Identification> = {
  [FAKE_CHANNELS.radiohead]: {
    entity: {
      category: 'music',
      itemType: 'artist',
      title: 'Radiohead',
      canonicalIds: { 'wikidata:entity': 'Q44190', 'youtube:channel': FAKE_CHANNELS.radiohead },
      confidence: 0.95,
      method: 'wikidata_canal_youtube',
    },
  },
  [FAKE_CHANNELS.podcast]: {
    entity: {
      category: 'podcasts',
      itemType: 'podcast',
      title: 'Podcast simulado',
      canonicalIds: { 'wikidata:entity': 'Q999999999', 'youtube:channel': FAKE_CHANNELS.podcast },
      confidence: 0.95,
      method: 'wikidata_canal_youtube',
    },
  },
  [FAKE_CHANNELS.vlog]: { entity: null, reason: 'out_of_scope', scope: 'persona' },
};

export function createFakeIdentifier(identifications: Record<string, IdentifiedEntity> = FAKE_IDENTIFICATIONS) {
  const calls: string[] = [];
  const identifyPlace = async (place: { name: string }) => {
    calls.push(`place:${place.name}`);
    return identifications[place.name] ?? null;
  };
  return {
    calls,
    identifier: {
      identifyPlace,
      identifyPlaces: async (places: Array<{ name: string }>) =>
        Promise.all(
          places.map(async (place): Promise<PlaceIdentification> => {
            const entity = await identifyPlace(place);
            return entity ? { entity } : { entity: null, reason: 'no_match' };
          }),
        ),
      identifyWork: async (work: { title: string; categories?: string[] }) => {
        calls.push(`work:${work.title}`);
        const entity = identifications[work.title] ?? null;
        return entity && (!work.categories || work.categories.includes(entity.category)) ? entity : null;
      },
      identifyPlacesByText: async (places: Array<{ name: string; address?: string }>): Promise<PlaceIdentification[]> =>
        places.map((place) => {
          calls.push(`text:${place.name}`);
          const entity = identifications[place.name];
          return entity ? { entity: { ...entity, confidence: entity.confidence * 0.9, method: `geocodificado_${entity.method}` } } : { entity: null, reason: 'no_match', nearby: 'none' };
        }),
      identifyApps: async (packages: string[]): Promise<Identification[]> =>
        packages.map((pkg) => {
          calls.push(`app:${pkg}`);
          const entity = identifications[pkg];
          return entity ? (entity.category === 'games' ? { entity } : { entity: null, reason: 'out_of_scope', scope: 'app' }) : { entity: null, reason: 'no_match' };
        }),
      identifyChannels: async (channels: ChannelToIdentify[]): Promise<Identification[]> =>
        channels.map((channel) => {
          calls.push(`channel:${channel.channelId}`);
          const byId = FAKE_CHANNEL_IDENTIFICATIONS[channel.channelId];
          if (byId) return byId;
          const artist = channel.musicName ? identifications[channel.musicName] : undefined;
          return artist?.category === 'music' ? { entity: artist } : { entity: null, reason: 'no_match' };
        }),
      identifyArtists: async (names: string[]): Promise<Identification[]> =>
        names.map((name) => {
          calls.push(`artist:${name}`);
          const artist = identifications[name];
          return artist?.category === 'music' ? { entity: artist } : { entity: null, reason: 'no_match' };
        }),
    },
  };
}

export interface FakeGoogleOptions {
  /** Google recuerda una concesión anterior y no entrega refresh token (sin pantalla de consentimiento). */
  omitRefreshToken?: boolean;
  exports?: Record<Group, Record<string, unknown>>;
  /** Grupos que el usuario deja marcados en el consentimiento (por defecto, todos los pedidos). */
  grantedGroups?: string[];
  /** Grupos con acceso único (el resto, temporal). */
  oneTimeGroups?: string[];
  /** Consultas de estado que devuelven IN_PROGRESS antes de COMPLETE. */
  pollsBeforeComplete?: number;
  /** Grupos cuyo primer export falla (para probar el reintento). */
  failOnce?: string[];
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function createFakeGoogle(options: FakeGoogleOptions = {}) {
  const exports = options.exports ?? defaultExports();
  const codes = new Map<string, { challenge: string; scope: string }>();
  const refreshTokens = new Set<string>();
  const accessTokens = new Set<string>();
  const jobs = new Map<string, { group: string; polls: number; failed: boolean }>();
  const exportedAt = new Map<string, number>();
  const calls: string[] = [];
  const revoked: string[] = [];
  let resets = 0;
  let counter = 0;
  const failOnce = new Set(options.failOnce ?? []);

  /** Simula que el usuario aprueba en Google: devuelve el `code` de la vuelta. */
  function approve(authorizationUrl: string): string {
    const url = new URL(authorizationUrl);
    const requested = (url.searchParams.get('scope') ?? '').split(' ');
    const granted = options.grantedGroups
      ? requested.filter((s) => options.grantedGroups!.some((g) => s.endsWith(`.${g}`)))
      : requested;
    const code = `codigo-simulado-${++counter}`;
    codes.set(code, { challenge: url.searchParams.get('code_challenge') ?? '', scope: granted.join(' ') });
    return code;
  }

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${url.host}${url.pathname}`);
    const form = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(typeof init?.body === 'string' && !init.body.startsWith('{') ? init.body : '');
    const auth = new Headers(init?.headers).get('authorization') ?? '';

    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
      if (form.get('client_secret') !== FAKE_CLIENT.clientSecret) return json({ error: 'invalid_client' }, 401);
      if (form.get('grant_type') === 'authorization_code') {
        const entry = codes.get(form.get('code') ?? '');
        if (!entry) return json({ error: 'invalid_grant' }, 400);
        const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
        if (challenge !== entry.challenge) return json({ error: 'invalid_grant' }, 400);
        codes.delete(form.get('code')!);
        const refresh = `refresh-simulado-${++counter}`;
        const access = `access-simulado-${++counter}`;
        refreshTokens.add(refresh);
        accessTokens.add(access);
        if (options.omitRefreshToken) return json({ access_token: access, expires_in: 3599, scope: entry.scope, token_type: 'Bearer' });
        return json({ access_token: access, expires_in: 3599, refresh_token: refresh, refresh_token_expires_in: 604_800, scope: entry.scope, token_type: 'Bearer' });
      }
      if (form.get('grant_type') === 'refresh_token') {
        if (!refreshTokens.has(form.get('refresh_token') ?? '')) return json({ error: 'invalid_grant' }, 400);
        const access = `access-simulado-${++counter}`;
        accessTokens.add(access);
        return json({ access_token: access, expires_in: 3599, token_type: 'Bearer' });
      }
      return json({ error: 'unsupported_grant_type' }, 400);
    }
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
      const token = form.get('token') ?? '';
      refreshTokens.delete(token);
      revoked.push(token);
      return json({});
    }
    if (url.host === 'storage.googleapis.com') {
      const job = jobs.get(url.pathname.split('/').at(-1)!.replace('.zip', ''));
      if (!job) return new Response('no', { status: 404 });
      const files = exports[job.group] ?? {};
      const zip = zipSync(Object.fromEntries(Object.entries(files).map(([path, data]) => [path, strToU8(typeof data === 'string' ? data : JSON.stringify(data))])));
      return new Response(zip, { status: 200, headers: { 'Content-Length': String(zip.byteLength) } });
    }
    if (url.host === 'dataportability.googleapis.com') {
      if (!accessTokens.has(auth.replace('Bearer ', ''))) return json({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401);
      const body = typeof init?.body === 'string' && init.body.startsWith('{') ? (JSON.parse(init.body) as { resources?: string[] }) : {};
      if (url.pathname === '/v1/portabilityArchive:initiate') {
        const group = body.resources?.[0] ?? '';
        const last = exportedAt.get(group);
        if (last !== undefined && (options.oneTimeGroups ?? []).includes(group)) {
          return json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RESOURCE_EXHAUSTED_ONE_TIME' }] } }, 429);
        }
        if (last !== undefined && Date.now() - last < 24 * 3600_000) {
          return json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RESOURCE_EXHAUSTED_TIME_BASED' }] } }, 429);
        }
        exportedAt.set(group, Date.now());
        const id = `job-${++counter}`;
        jobs.set(id, { group, polls: 0, failed: failOnce.delete(group) });
        return json({ archiveJobId: id, accessType: (options.oneTimeGroups ?? []).includes(group) ? 'ACCESS_TYPE_ONE_TIME' : 'ACCESS_TYPE_TIME_BASED' });
      }
      const stateMatch = /^\/v1\/archiveJobs\/([^/]+)\/portabilityArchiveState$/.exec(url.pathname);
      if (stateMatch) {
        const job = jobs.get(stateMatch[1]!);
        if (!job) return json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
        if (job.failed) return json({ state: 'FAILED' });
        job.polls++;
        if (job.polls <= (options.pollsBeforeComplete ?? 0)) return json({ state: 'IN_PROGRESS' });
        return json({ state: 'COMPLETE', urls: [`https://storage.googleapis.com/fake/${stateMatch[1]}.zip`], exportTime: new Date().toISOString() });
      }
      const retryMatch = /^\/v1\/archiveJobs\/([^/]+):retry$/.exec(url.pathname);
      if (retryMatch) {
        const job = jobs.get(retryMatch[1]!);
        if (!job) return json({ error: { code: 404 } }, 404);
        const id = `job-${++counter}`;
        jobs.set(id, { group: job.group, polls: 0, failed: false });
        return json({ archiveJobId: id });
      }
      if (url.pathname === '/v1/accessType:check') {
        const oneTime = options.oneTimeGroups ?? [];
        const all = Object.keys(exports);
        return json({ oneTimeResources: all.filter((g) => oneTime.includes(g)), timeBasedResources: all.filter((g) => !oneTime.includes(g)) });
      }
      if (url.pathname === '/v1/authorization:reset') {
        resets++;
        accessTokens.clear();
        return json({});
      }
    }
    return json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
  }) as typeof fetch;

  return {
    fetchImpl,
    approve,
    calls,
    revoked,
    refreshTokens,
    /** Simula que pasa el tiempo: permite un nuevo export temporal. */
    allowNewExports: () => exportedAt.clear(),
    resets: () => resets,
  };
}
