import { percentile } from '@appinity/algorithms';
import type { EntityIdentifier, IdentifiedEntity, Identification } from '@appinity/shared';
import { YT_MAX_CHANNELS, YT_MAX_LIBRARY_ARTISTS, YT_MAX_SUBSCRIPTIONS, type YouTubeGroup } from './constants.js';
import type { GoogleRecord } from './schemas.js';

/**
 * YouTube y YouTube Music (fase 4). Formatos documentados (Data Portability, verificado el 2026-10-13):
 * - `myactivity.youtube`: registros de Mi actividad en JSON (`header`, `title`, `titleUrl`, `subtitles`, `time`,
 *   `details`…) y también en HTML (se ignora). Incluye búsquedas, visitas y anuncios.
 * - `youtube.subscriptions`: CSV con «Channel ID», «Channel URL» y «Channel Title».
 * - `youtube.music`: CSV «music library songs» con «Video ID», «Song Title», «Album Title» y «Artist Name» (además de
 *   la música subida por el usuario, que no se lee).
 *
 * Los títulos de Mi actividad están traducidos al idioma de la cuenta («Watched…», «Has visto…»), así que una
 * reproducción se reconoce por su URL (`/watch?v=`), no por el texto. Los anuncios llevan `details` («From Google
 * Ads»). Nunca se guardan títulos de vídeos ni búsquedas: solo recuentos por canal.
 */

const WATCH_URL = /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]{11}/;
const CHANNEL_URL = /youtube\.com\/channel\/(UC[\w-]{22})/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
/** Canal autogenerado de un artista («Radiohead - Topic»; en español, «Radiohead - Tema»). */
const TOPIC_SUFFIX = /\s+-\s+(?:Topic|Tema|Thème|Thema|Tema musicale)$/i;

export interface ChannelActivity {
  channelId: string;
  title: string;
  plays: number;
  /** Reproducciones en YouTube Music (o en music.youtube.com). */
  musicPlays: number;
  lastPlayed?: string;
}

export interface SubscribedChannel {
  channelId: string;
  title: string;
}

export interface LibraryArtist {
  name: string;
  songs: number;
}

export type YouTubeExtract =
  | { group: 'myactivity.youtube'; channels: ChannelActivity[] }
  | { group: 'youtube.subscriptions'; channels: SubscribedChannel[] }
  | { group: 'youtube.music'; artists: LibraryArtist[] };

/** Diagnóstico sin datos personales que se añade al resumen del export. */
export interface ExtractNotes {
  records: number;
  skip: (reason: string) => void;
  key: (key: string) => void;
  enumValue: (field: string, value: unknown) => void;
  url: (url: string) => void;
}

const norm = (key: string) => key.toLowerCase().replace(/[\s_-]/g, '');
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** CSV (RFC 4180: comillas, comas y saltos de línea dentro de campos) → filas con las cabeceras como claves. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** Valor de una columna por su nombre normalizado («Channel ID» → «channelid»). */
function column(row: Record<string, string>, ...names: string[]): string | undefined {
  const wanted = names.map(norm);
  const key = Object.keys(row).find((k) => wanted.includes(norm(k)));
  return key ? str(row[key]) : undefined;
}

function isoDate(value: unknown): string | undefined {
  const text = str(value);
  if (!text) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** Recorre el JSON y devuelve los objetos que tienen alguna de las claves indicadas (sin descender dentro de ellos). */
function objectsWith(root: unknown, anyOf: string[]): Array<Record<string, unknown>> {
  const wanted = anyOf.map(norm);
  const out: Array<Record<string, unknown>> = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) for (const n of node) walk(n);
    else if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (Object.keys(obj).some((k) => wanted.includes(norm(k)))) out.push(obj);
      else for (const v of Object.values(obj)) walk(v);
    }
  };
  walk(root);
  return out;
}

/**
 * Extrae los datos de un grupo de YouTube. `json` son los JSON del archivo y `csv` las filas de cada CSV.
 * Solo se cuentan reproducciones (URL `/watch?v=`) con canal y sin `details` (anuncios).
 */
export function extractYouTube(group: YouTubeGroup, json: unknown[], csv: Array<Array<Record<string, string>>>, notes: ExtractNotes): YouTubeExtract {
  if (group === 'myactivity.youtube') {
    const channels = new Map<string, ChannelActivity>();
    for (const file of json) {
      for (const record of objectsWith(file, ['titleUrl', 'header'])) {
        Object.keys(record).forEach(notes.key);
        notes.enumValue('header', record.header);
        const url = str(record.titleUrl);
        if (!url || !WATCH_URL.test(url)) {
          notes.skip('no_es_reproduccion');
          continue;
        }
        notes.url(url);
        if (Array.isArray(record.details) && record.details.length) {
          notes.skip('anuncio');
          continue;
        }
        const subtitles = Array.isArray(record.subtitles) ? (record.subtitles as Array<Record<string, unknown>>) : [];
        const channelId = subtitles.map((s) => CHANNEL_URL.exec(str(s?.url) ?? '')?.[1]).find(Boolean);
        if (!channelId) {
          notes.skip('sin_canal');
          continue;
        }
        const title = str(subtitles.find((s) => CHANNEL_URL.test(str(s?.url) ?? ''))?.name) ?? channelId;
        const music = record.header === 'YouTube Music' || /\/\/music\.youtube\.com\//.test(url);
        const date = isoDate(record.time);
        const current = channels.get(channelId) ?? { channelId, title, plays: 0, musicPlays: 0 };
        current.plays++;
        if (music) current.musicPlays++;
        if (date && (!current.lastPlayed || date > current.lastPlayed)) current.lastPlayed = date;
        channels.set(channelId, current);
        notes.records++;
      }
    }
    return { group, channels: [...channels.values()] };
  }

  if (group === 'youtube.subscriptions') {
    const channels = new Map<string, SubscribedChannel>();
    for (const rows of csv) {
      for (const row of rows) {
        Object.keys(row).forEach(notes.key);
        const channelId = column(row, 'Channel ID', 'Channel Id') ?? Object.values(row).find((v) => CHANNEL_ID.test(v));
        if (!channelId || !CHANNEL_ID.test(channelId)) {
          notes.skip('sin_canal');
          continue;
        }
        const url = column(row, 'Channel URL', 'Channel Url');
        if (url) notes.url(url);
        channels.set(channelId, { channelId, title: column(row, 'Channel Title') ?? channelId });
        notes.records++;
      }
    }
    return { group, channels: [...channels.values()] };
  }

  const artists = new Map<string, LibraryArtist>();
  for (const rows of csv) {
    for (const row of rows) {
      Object.keys(row).forEach(notes.key);
      const name = column(row, 'Artist Name', 'Artist Names', 'Artist')?.replace(TOPIC_SUFFIX, '');
      if (!name) {
        notes.skip('sin_artista');
        continue;
      }
      const current = artists.get(name) ?? { name, songs: 0 };
      current.songs++;
      artists.set(name, current);
      notes.records++;
    }
  }
  return { group, artists: [...artists.values()] };
}

/** Resultado de procesar un grupo de YouTube: registros para el mapper y recuentos de identificación. */
export interface YouTubeResult {
  records: GoogleRecord[];
  identifications: Identification[];
  /** Entradas que no se consultaron por superar el máximo (los menos escuchados). */
  beyondLimit: number;
  /** Entradas del export (canales o artistas distintos). */
  total: number;
  stats: Record<string, number>;
}

/** Clave de fusión: la misma entidad del catálogo aunque llegue por varios canales (el oficial y el «Topic»). */
const entityKey = (entity: IdentifiedEntity, fallback: string) => {
  const qid = entity.canonicalIds['wikidata:entity'];
  return qid ? `wd:${qid}` : fallback;
};

/** El canal se busca también como artista si es un «Topic» o si se escuchó en YouTube Music. */
function musicName(title: string, heardInMusic: boolean): string | undefined {
  if (TOPIC_SUFFIX.test(title)) return title.replace(TOPIC_SUFFIX, '');
  return heardInMusic ? title : undefined;
}

/**
 * Identifica y agrega un grupo de YouTube. Escuchas: por artista o programa (suma de sus canales), con el percentil 95
 * del propio usuario por categoría en `stats` para calibrar la preferencia. Suscripciones y biblioteca: una entrada
 * por artista o programa.
 */
export async function processYouTube(
  data: YouTubeExtract,
  identifier: EntityIdentifier,
  onProgress?: (message: string) => void,
): Promise<YouTubeResult> {
  const progress = (done: number, total: number) => onProgress?.(`${data.group}: ${done}/${total} consultados`);

  if (data.group === 'myactivity.youtube') {
    const ranked = data.channels.toSorted((a, b) => b.plays - a.plays || a.channelId.localeCompare(b.channelId));
    const chosen = ranked.slice(0, YT_MAX_CHANNELS);
    onProgress?.(`${data.group}: identificando ${chosen.length} canales con Wikidata`);
    const identifications = await identifier.identifyChannels(
      chosen.map((c) => {
        const name = musicName(c.title, c.musicPlays > 0);
        return { channelId: c.channelId, title: c.title, ...(name ? { musicName: name } : {}) };
      }),
      progress,
    );
    const merged = new Map<string, { entity: IdentifiedEntity; plays: number; musicPlays: number; channels: number; date?: string }>();
    chosen.forEach((channel, i) => {
      const entity = identifications[i]!.entity;
      if (!entity) return;
      const key = entityKey(entity, `channel:${channel.channelId}`);
      const current = merged.get(key) ?? { entity, plays: 0, musicPlays: 0, channels: 0 };
      current.plays += channel.plays;
      current.musicPlays += channel.musicPlays;
      current.channels++;
      // Si un canal lo identifica por su ID (más fiable), esa identificación prevalece.
      if (entity.confidence > current.entity.confidence) current.entity = entity;
      if (channel.lastPlayed && (!current.date || channel.lastPlayed > current.date)) current.date = channel.lastPlayed;
      merged.set(key, current);
    });
    const records: GoogleRecord[] = [...merged].map(([key, m]) => ({
      recordId: key,
      identified: m.entity,
      record: { group: 'myactivity.youtube', plays: m.plays, musicPlays: m.musicPlays, channels: m.channels, ...(m.date ? { date: m.date } : {}) },
    }));
    const stats: Record<string, number> = {};
    for (const category of ['music', 'podcasts'] as const) {
      const p95 = percentile(records.filter((r) => r.identified.category === category).map((r) => (r.record as { plays: number }).plays), 0.95);
      if (p95 !== null) stats[`yt_plays_p95_${category}`] = p95;
    }
    return { records, identifications, beyondLimit: ranked.length - chosen.length, total: ranked.length, stats };
  }

  if (data.group === 'youtube.subscriptions') {
    const chosen = data.channels.slice(0, YT_MAX_SUBSCRIPTIONS);
    onProgress?.(`${data.group}: identificando ${chosen.length} canales con Wikidata`);
    const identifications = await identifier.identifyChannels(
      chosen.map((c) => {
        const name = musicName(c.title, false);
        return { channelId: c.channelId, title: c.title, ...(name ? { musicName: name } : {}) };
      }),
      progress,
    );
    const merged = new Map<string, { entity: IdentifiedEntity; channels: number }>();
    chosen.forEach((channel, i) => {
      const entity = identifications[i]!.entity;
      if (!entity) return;
      const key = entityKey(entity, `channel:${channel.channelId}`);
      const current = merged.get(key) ?? { entity, channels: 0 };
      current.channels++;
      merged.set(key, current);
    });
    const records: GoogleRecord[] = [...merged].map(([key, m]) => ({
      recordId: key,
      identified: m.entity,
      record: { group: 'youtube.subscriptions', channels: m.channels },
    }));
    return { records, identifications, beyondLimit: data.channels.length - chosen.length, total: data.channels.length, stats: {} };
  }

  const ranked = data.artists.toSorted((a, b) => b.songs - a.songs || a.name.localeCompare(b.name));
  const chosen = ranked.slice(0, YT_MAX_LIBRARY_ARTISTS);
  onProgress?.(`${data.group}: identificando ${chosen.length} artistas con Wikidata`);
  const identifications = await identifier.identifyArtists(
    chosen.map((a) => a.name),
    progress,
  );
  const merged = new Map<string, { entity: IdentifiedEntity; songs: number }>();
  chosen.forEach((artist, i) => {
    const entity = identifications[i]!.entity;
    if (!entity) return;
    const key = entityKey(entity, `artist:${artist.name.toLowerCase()}`);
    const current = merged.get(key) ?? { entity, songs: 0 };
    current.songs += artist.songs;
    merged.set(key, current);
  });
  const records: GoogleRecord[] = [...merged].map(([key, m]) => ({
    recordId: key,
    identified: m.entity,
    record: { group: 'youtube.music', songs: m.songs },
  }));
  return { records, identifications, beyondLimit: ranked.length - chosen.length, total: ranked.length, stats: {} };
}
