import {
  SourceError,
  normalizeTitle,
  type Category,
  type ChannelToIdentify,
  type IdentifiedEntity,
  type Identification,
} from '@appinity/shared';
import { z } from 'zod';

/**
 * Identificación de obras con Wikidata (CC0, uso comercial sin restricciones). Se usa cuando la fuente solo aporta un
 * título sin tipo ni identificador (las valoraciones de la Búsqueda de Google).
 *
 * Regla: candidatos cuya etiqueta o alias normalizado es IDÉNTICO al título y cuyo tipo (P31) es una película, serie,
 * videojuego, libro o artista musical. Un único candidato → confianza 0,8. Varios: solo se elige el que tenga al menos
 * el doble de enlaces a Wikipedias que el siguiente (confianza 0,65). Si no, no se identifica. Un disco, single o
 * canción se atribuye a su intérprete (P175) cuando es uno solo: en música se recomienda el artista (§6).
 */
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

const TYPES: Record<string, { category: Category; itemType: string }> = {
  Q11424: { category: 'movies', itemType: 'movie' }, // película
  Q506240: { category: 'movies', itemType: 'movie' }, // telefilme
  Q202866: { category: 'movies', itemType: 'movie' }, // película de animación
  Q24862: { category: 'movies', itemType: 'movie' }, // cortometraje
  Q93204: { category: 'movies', itemType: 'movie' }, // documental
  Q20650540: { category: 'movies', itemType: 'movie' }, // película de anime
  Q5398426: { category: 'series', itemType: 'series' }, // serie de televisión
  Q581714: { category: 'series', itemType: 'series' }, // serie de animación
  Q117467246: { category: 'series', itemType: 'series' }, // serie de televisión de animación
  Q1259759: { category: 'series', itemType: 'series' }, // miniserie
  Q63952888: { category: 'series', itemType: 'series' }, // serie de anime
  Q526877: { category: 'series', itemType: 'series' }, // serie web
  Q7889: { category: 'games', itemType: 'game' }, // videojuego
  Q7725634: { category: 'books', itemType: 'book' }, // obra literaria
  Q47461344: { category: 'books', itemType: 'book' }, // obra escrita
  Q8261: { category: 'books', itemType: 'book' }, // novela
  Q571: { category: 'books', itemType: 'book' }, // libro
  Q49084: { category: 'books', itemType: 'book' }, // relato
  Q725377: { category: 'books', itemType: 'book' }, // novela gráfica
  Q215380: { category: 'music', itemType: 'artist' }, // grupo musical
  Q5741069: { category: 'music', itemType: 'artist' }, // grupo de rock
  Q2088357: { category: 'music', itemType: 'artist' }, // agrupación musical
  Q9212979: { category: 'music', itemType: 'artist' }, // dúo musical
};
/** Programas de podcast (P31). */
const PODCAST_TYPES = new Set(['Q24634210']);
/** Canales por consulta de búsqueda (`haswbstatement:P2397=A|P2397=B…`, comprobado el 2026-10-13). */
const CHANNEL_BATCH = 40;
const CHANNEL_ID = /^UC[\w-]{22}$/;
/** Obras musicales que se atribuyen a su intérprete. */
const MUSIC_WORKS = new Set(['Q482994', 'Q208569', 'Q134556', 'Q7366', 'Q105543609']);
/** Ocupaciones (P106) que hacen de una persona (Q5) un artista musical. */
const MUSICIAN_OCCUPATIONS = new Set(['Q177220', 'Q639669', 'Q488205', 'Q2252262', 'Q36834', 'Q130857', 'Q753110', 'Q855091', 'Q486748']);

const textSearchSchema = z.object({
  query: z.object({ search: z.array(z.object({ title: z.string() })).default([]) }).optional(),
});

const searchSchema = z.object({
  search: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        match: z.object({ type: z.string(), text: z.string() }).optional(),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});

const claimSchema = z.object({
  mainsnak: z.object({
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});
const entitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      id: z.string().optional(),
      missing: z.string().optional(),
      claims: z.record(z.string(), z.array(claimSchema)).optional(),
      labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
      sitelinks: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});
type Entity = z.infer<typeof entitiesSchema>['entities'][string];

const ids = (entity: Entity, property: string): string[] =>
  (entity.claims?.[property] ?? [])
    .map((c) => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id)
    .filter((v): v is string => Boolean(v));

function year(entity: Entity, ...properties: string[]): number | undefined {
  const years = properties
    .flatMap((p) => entity.claims?.[p] ?? [])
    .map((c) => (c.mainsnak.datavalue?.value as { time?: string } | undefined)?.time)
    .map((t) => (t ? Number(/^[+-](\d{4})/.exec(t)?.[1]) : NaN))
    .filter((y) => Number.isInteger(y) && y >= 1000 && y <= 3000);
  return years.length ? Math.min(...years) : undefined;
}

/** Etiqueta en los idiomas pedidos o, si no, la común («mul»): Wikidata guarda ahí muchos nombres propios. */
const label = (entity: Entity, languages: string[]) => [...languages, 'mul'].map((l) => entity.labels?.[l]?.value).find(Boolean);

const strings = (entity: Entity, property: string): string[] =>
  (entity.claims?.[property] ?? []).map((c) => c.mainsnak.datavalue?.value).filter((v): v is string => typeof v === 'string');

/**
 * Identificadores externos que solo tienen los artistas musicales (MusicBrainz, Spotify, Apple Music, Discogs) y los
 * podcasts (Apple Podcasts, Spotify). Comprobado el 2026-10-13. Con YouTube real, exigir tipos y ocupaciones concretos
 * dejaba fuera a muchos artistas (grupos de subtipos no listados, ocupaciones como «cantautor de trap»…).
 */
const ARTIST_ID_PROPERTIES = ['P434', 'P1902', 'P2850', 'P1953'];
const PODCAST_ID_PROPERTIES = ['P5842', 'P5916'];
const hasAny = (entity: Entity, properties: string[]) => properties.some((p) => (entity.claims?.[p] ?? []).length > 0);

/** Tipo de APPINITY de una entidad de Wikidata; `musicWork`: disco o canción (se atribuye a su intérprete). */
function kindOf(entity: Entity): { kind: { category: Category; itemType: string }; musicWork: boolean } | null {
  const p31 = ids(entity, 'P31');
  const direct = p31.map((t) => TYPES[t]).find(Boolean);
  if (direct) return { kind: direct, musicWork: false };
  if (p31.includes('Q5') && ids(entity, 'P106').some((o) => MUSICIAN_OCCUPATIONS.has(o))) {
    return { kind: { category: 'music', itemType: 'artist' }, musicWork: false };
  }
  if (p31.some((t) => PODCAST_TYPES.has(t))) return { kind: { category: 'podcasts', itemType: 'podcast' }, musicWork: false };
  if (p31.some((t) => MUSIC_WORKS.has(t))) return { kind: { category: 'music', itemType: 'artist' }, musicWork: true };
  // Sin tipo reconocido: un ID de artista o de podcast en una plataforma musical lo delata.
  if (hasAny(entity, PODCAST_ID_PROPERTIES)) return { kind: { category: 'podcasts', itemType: 'podcast' }, musicWork: false };
  if (hasAny(entity, ARTIST_ID_PROPERTIES)) return { kind: { category: 'music', itemType: 'artist' }, musicWork: false };
  return null;
}

/** Categorías que se aceptan para un canal de YouTube: artistas musicales y programas de podcast. */
const isChannelKind = (k: { category: Category; itemType: string }) =>
  (k.category === 'music' && k.itemType === 'artist') || k.category === 'podcasts';

export interface WikidataWorkIdentifierOptions {
  userAgent: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class WikidataWorkIdentifier {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, IdentifiedEntity | null>();
  private readonly channelCache = new Map<string, Identification>();

  constructor(private readonly options: WikidataWorkIdentifierOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** `artistsOnly`: solo grupos y personas músicos (sin obras musicales ni otros tipos). */
  async identifyWork(work: { title: string; languages?: string[]; artistsOnly?: boolean }): Promise<IdentifiedEntity | null> {
    const languages = work.languages?.length ? work.languages : ['es', 'en'];
    const wanted = normalizeTitle(work.title);
    if (!wanted) return null;
    const cacheKey = `${work.artistsOnly ? 'artist' : 'work'}:${languages.join(',')}:${wanted}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const found = new Set<string>();
    for (const language of languages) {
      const data = searchSchema.parse(
        await this.get({ action: 'wbsearchentities', search: work.title, language, uselang: language, type: 'item', limit: '20' }),
      );
      for (const hit of data.search) {
        const texts = [hit.match?.text, hit.label, ...(hit.aliases ?? [])].filter((t): t is string => Boolean(t));
        if (texts.some((t) => normalizeTitle(t) === wanted)) found.add(hit.id);
      }
    }
    const result = found.size ? await this.choose([...found], languages, work.artistsOnly ?? false) : null;
    if (this.cache.size > 5_000) this.cache.clear();
    this.cache.set(cacheKey, result);
    return result;
  }

  /** Clasifica los candidatos por su tipo y elige uno solo si es inequívoco. */
  private async choose(qids: string[], languages: string[], artistsOnly: boolean): Promise<IdentifiedEntity | null> {
    const entities = await this.entities(qids, languages);
    const typed: Array<{ entity: Entity; qid: string; kind: { category: Category; itemType: string }; sitelinks: number; musicWork: boolean }> = [];
    for (const qid of qids) {
      const entity = entities[qid];
      if (!entity || entity.missing !== undefined) continue;
      const found = kindOf(entity);
      // Los podcasts solo se identifican por su canal: un título suelto es demasiado ambiguo.
      if (!found || found.kind.category === 'podcasts') continue;
      if (artistsOnly && (found.musicWork || found.kind.category !== 'music')) continue;
      typed.push({ entity, qid, ...found, sitelinks: Object.keys(entity.sitelinks ?? {}).length });
    }
    if (!typed.length) return null;
    typed.sort((a, b) => b.sitelinks - a.sitelinks);
    const [first, second] = typed;
    const unique = typed.length === 1;
    if (!unique && first!.sitelinks < 2 * Math.max(1, second!.sitelinks)) return null;
    const confidence = unique ? 0.8 : 0.65;
    if (artistsOnly) {
      return {
        category: 'music',
        itemType: 'artist',
        title: label(first!.entity, languages) ?? first!.qid,
        canonicalIds: { 'wikidata:entity': first!.qid },
        confidence,
        method: unique ? 'wikidata_nombre_artista_unico' : 'wikidata_nombre_artista_dominante',
      };
    }

    if (first!.musicWork) {
      // En música el objeto recomendado es el artista: la obra se atribuye a su único intérprete.
      const performers = ids(first!.entity, 'P175');
      if (performers.length !== 1) return null;
      const performer = (await this.entities(performers, languages))[performers[0]!];
      const name = performer && label(performer, languages);
      if (!name) return null;
      return {
        category: 'music',
        itemType: 'artist',
        title: name,
        canonicalIds: { 'wikidata:entity': performers[0]! },
        confidence: Math.round(confidence * 0.9 * 1000) / 1000,
        method: unique ? 'wikidata_titulo_exacto_unico_obra_musical' : 'wikidata_titulo_exacto_dominante_obra_musical',
      };
    }
    const title = label(first!.entity, languages) ?? first!.qid;
    const releaseYear = year(first!.entity, 'P577', 'P580');
    return {
      category: first!.kind.category,
      itemType: first!.kind.itemType,
      title,
      canonicalIds: { 'wikidata:entity': first!.qid },
      ...(releaseYear ? { releaseYear } : {}),
      confidence,
      method: unique ? 'wikidata_titulo_exacto_unico' : 'wikidata_titulo_exacto_dominante',
    };
  }

  /**
   * Canales de YouTube: búsqueda exacta por la propiedad P2397 (ID de canal) en lotes; solo se aceptan artistas
   * musicales y podcasts (0,95). Si el canal no figura y hay `musicName`, se busca el artista por nombre exacto (0,8
   * o 0,65), sin atribuirle el ID del canal.
   */
  async identifyChannels(channels: ChannelToIdentify[], onProgress?: (done: number, total: number) => void): Promise<Identification[]> {
    const languages = ['es', 'en'];
    const pending = [...new Map(channels.filter((c) => !this.channelCache.has(c.channelId)).map((c) => [c.channelId, c])).values()];
    for (let start = 0; start < pending.length; start += CHANNEL_BATCH) {
      const batch = pending.slice(start, start + CHANNEL_BATCH);
      const valid = batch.filter((c) => CHANNEL_ID.test(c.channelId));
      const byChannel = new Map<string, Array<{ qid: string; entity: Entity }>>();
      if (valid.length) {
        const found = textSearchSchema.parse(
          await this.get({
            action: 'query',
            list: 'search',
            srsearch: `haswbstatement:${valid.map((c) => `P2397=${c.channelId}`).join('|')}`,
            srnamespace: '0',
            srlimit: '50',
            srprop: '',
          }),
        );
        const qids = (found.query?.search ?? []).map((hit) => hit.title).filter((t) => /^Q\d+$/.test(t));
        const entities = qids.length ? await this.entities(qids, languages) : {};
        for (const [qid, entity] of Object.entries(entities)) {
          for (const channelId of strings(entity, 'P2397')) byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), { qid, entity }]);
        }
      }
      for (const channel of batch) {
        let result = classifyChannel(channel.channelId, byChannel.get(channel.channelId) ?? [], languages);
        if (result.entity === null && result.reason === 'no_match' && channel.musicName) {
          const artist = await this.identifyWork({ title: channel.musicName, languages, artistsOnly: true });
          result = artist ? { entity: artist } : { entity: null, reason: 'no_match', triedName: true };
        }
        if (this.channelCache.size > 20_000) this.channelCache.clear();
        this.channelCache.set(channel.channelId, result);
      }
      onProgress?.(Math.min(start + CHANNEL_BATCH, pending.length), pending.length);
    }
    return channels.map((c) => this.channelCache.get(c.channelId) ?? { entity: null, reason: 'no_match' });
  }

  /** Artistas por nombre exacto (solo grupos y personas músicos). */
  async identifyArtists(names: string[], onProgress?: (done: number, total: number) => void): Promise<Identification[]> {
    const unique = [...new Set(names)];
    const found = new Map<string, Identification>();
    for (const [i, name] of unique.entries()) {
      const entity = await this.identifyWork({ title: name, languages: ['es', 'en'], artistsOnly: true });
      found.set(name, entity ? { entity } : { entity: null, reason: 'no_match' });
      if ((i + 1) % 25 === 0 || i + 1 === unique.length) onProgress?.(i + 1, unique.length);
    }
    return names.map((n) => found.get(n)!);
  }

  private async entities(qids: string[], languages: string[]): Promise<Record<string, Entity>> {
    const out: Record<string, Entity> = {};
    for (let i = 0; i < qids.length; i += 50) {
      const data = entitiesSchema.parse(
        await this.get({
          action: 'wbgetentities',
          ids: qids.slice(i, i + 50).join('|'),
          props: 'claims|labels|sitelinks',
          languages: [...languages, 'mul'].join('|'),
        }),
      );
      Object.assign(out, data.entities);
    }
    return out;
  }

  private async get(params: Record<string, string>): Promise<unknown> {
    const url = new URL(this.options.endpoint ?? WIKIDATA_API);
    for (const [k, v] of Object.entries({ ...params, format: 'json', maxlag: '5' })) url.searchParams.set(k, v);
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      } catch {
        await this.sleep(1_000 * 2 ** attempt);
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        await this.sleep(Number(response.headers.get('retry-after') ?? '0') * 1000 || 2_000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new SourceError('bad_response', `Wikidata respondió HTTP ${response.status}`, false);
      const data = (await response.json()) as { error?: { code?: string } };
      if (data.error?.code === 'maxlag') {
        await this.sleep(5_000);
        continue;
      }
      return data;
    }
    throw new SourceError('unavailable', 'Wikidata no responde; se reintentará', true);
  }
}

/** Elige la entidad de un canal: debe ser única en su categoría (o dominante por enlaces a Wikipedias). */
function classifyChannel(channelId: string, matches: Array<{ qid: string; entity: Entity }>, languages: string[]): Identification {
  if (!matches.length) return { entity: null, reason: 'no_match' };
  const typed = matches.flatMap((m) => {
    const found = kindOf(m.entity);
    return found && !found.musicWork && isChannelKind(found.kind)
      ? [{ ...m, kind: found.kind, sitelinks: Object.keys(m.entity.sitelinks ?? {}).length }]
      : [];
  });
  if (!typed.length) {
    return { entity: null, reason: 'out_of_scope', scope: matches.some((m) => ids(m.entity, 'P31').includes('Q5')) ? 'persona' : 'otro tipo de canal' };
  }
  if (new Set(typed.map((t) => t.kind.category)).size > 1) return { entity: null, reason: 'ambiguous' };
  typed.sort((a, b) => b.sitelinks - a.sitelinks);
  const [first, second] = typed;
  if (second && first!.sitelinks < 2 * Math.max(1, second.sitelinks)) return { entity: null, reason: 'ambiguous' };
  return {
    entity: {
      category: first!.kind.category,
      itemType: first!.kind.itemType,
      title: label(first!.entity, languages) ?? first!.qid,
      canonicalIds: { 'wikidata:entity': first!.qid, 'youtube:channel': channelId },
      confidence: 0.95,
      method: 'wikidata_canal_youtube',
    },
  };
}
