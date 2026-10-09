import {
  SourceError,
  normalizeTitle,
  type Category,
  type IdentifiedEntity,
  type PlaceIdentification,
  type PlaceToIdentify,
} from '@appinity/shared';
import { z } from 'zod';

/**
 * Identificación de lugares con OpenStreetMap (Overpass API). OSM: datos bajo ODbL, uso comercial permitido con la
 * atribución «© OpenStreetMap contributors»; solo se guarda la categoría y el identificador del elemento. La instancia
 * pública de Overpass pide un uso moderado (≈10.000 consultas/día): para producción se usará una instancia propia o un
 * proveedor (decisions.md).
 *
 * Regla de identificación: elementos con nombre a ≤ 100 m de las coordenadas exportadas por Google cuyo nombre
 * normalizado coincide EXACTAMENTE (o tras quitar palabras genéricas como «restaurante» o «museo»). Si hay varias
 * coincidencias de categorías distintas, no se identifica. Se consultan también los demás comercios y servicios con
 * nombre: si el que mejor coincide es, p. ej., un hotel, el lugar queda fuera de las categorías de APPINITY.
 */
export const OVERPASS_DEFAULT_URL = 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 100;
const MIN_INTERVAL_MS = 1_100;
/**
 * Lugares por consulta. Cada consulta bloquea un hueco de la IP ~60 s aunque dure 5 s (instancia pública, medido el
 * 2026-10-09), así que se agrupan: 25 lugares tardan ~26 s en una sola consulta.
 */
export const OVERPASS_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;
/** Espera entre reintentos ante 429/504: 15 s, 30 s, 60 s y después 2 min. */
const retryDelayMs = (attempt: number) => Math.min(15_000 * 2 ** attempt, 120_000);

const elementSchema = z.object({
  // node/way/relation, o «sep»: separador creado con `make` entre los resultados de cada lugar del lote.
  type: z.string(),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
const overpassSchema = z.object({ elements: z.array(elementSchema), remark: z.string().optional() });
type OsmElement = z.infer<typeof elementSchema> & { type: 'node' | 'way' | 'relation' };
const isOsmElement = (el: z.infer<typeof elementSchema>): el is OsmElement => ['node', 'way', 'relation'].includes(el.type);

const FOOD_AMENITIES = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'ice_cream', 'biergarten']);
const CULTURE_AMENITIES = new Set(['theatre', 'cinema', 'arts_centre', 'concert_hall', 'planetarium']);
const CULTURE_TOURISM = new Set(['museum', 'gallery']);
const CULTURE_HISTORIC = new Set(['castle', 'monument', 'archaeological_site']);

/**
 * Palabras genéricas que Google y OSM ponen o quitan del nombre («Restaurante Can Pep» ↔ «Can Pep»). Sin partículas
 * como «de»: «Museu de la Sagrada Família» coincidiría con «Sagrada Família» por delante de la basílica.
 */
const GENERIC_WORDS = new Set([
  'restaurante', 'restaurant', 'bar', 'cafe', 'cafeteria', 'taberna', 'tasca', 'pizzeria', 'museo', 'museu', 'museum',
  'teatro', 'teatre', 'theatre', 'cine', 'cinema', 'cines', 'galeria', 'gallery', 'el', 'la', 'los', 'las', 'les', 'l', 'the',
]);
const stripGeneric = (name: string) =>
  normalizeTitle(name)
    .split(' ')
    .filter((w) => !GENERIC_WORDS.has(w))
    .join(' ');

/** Categoría de APPINITY a partir de las etiquetas de OSM; null si no es un restaurante ni un lugar cultural. */
export function classifyOsmTags(tags: Record<string, string>): { category: Category; itemType: string } | null {
  if (tags.amenity && FOOD_AMENITIES.has(tags.amenity)) return { category: 'food', itemType: 'restaurant' };
  if (tags.tourism && CULTURE_TOURISM.has(tags.tourism)) return { category: 'culture', itemType: 'museum' };
  if (tags.amenity && CULTURE_AMENITIES.has(tags.amenity)) return { category: 'culture', itemType: 'venue' };
  if (tags.historic && CULTURE_HISTORIC.has(tags.historic)) return { category: 'culture', itemType: 'venue' };
  // Monumentos visitables: atracción, obra o templo con valor histórico o patrimonial (Sagrada Família, Casa Batlló).
  const landmark = Boolean(tags.historic || tags.heritage);
  if (landmark && (tags.tourism === 'attraction' || tags.tourism === 'artwork' || tags.amenity === 'place_of_worship')) {
    return { category: 'culture', itemType: 'venue' };
  }
  return null;
}

/** Claves de OSM que se consultan: las de las categorías de APPINITY y las que permiten decir qué es lo demás. */
const POI_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'historic', 'heritage', 'craft', 'office', 'club', 'healthcare'];

/** Etiqueta genérica (sin datos personales) de un lugar fuera de las categorías de APPINITY. */
export function osmScope(tags: Record<string, string>): string {
  if (tags.tourism && ['hotel', 'hostel', 'motel', 'guest_house', 'apartment', 'camp_site', 'chalet'].includes(tags.tourism)) return 'alojamiento';
  if (tags.shop) return 'tienda';
  if (tags.amenity === 'marketplace') return 'mercado';
  if (tags.amenity === 'nightclub') return 'ocio nocturno';
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'parque';
  if (tags.leisure) return 'ocio y deporte';
  if (tags.tourism) return 'atracción';
  if (tags.historic || tags.heritage) return 'patrimonio';
  if (tags.healthcare || ['hospital', 'clinic', 'pharmacy', 'dentist', 'doctors'].includes(tags.amenity ?? '')) return 'salud';
  if (tags.office || tags.craft) return 'empresa';
  if (tags.amenity) return 'servicio';
  return 'otro';
}

/**
 * Una consulta Overpass para varios lugares: por cada uno, los elementos con nombre a ≤ 100 m que tengan alguna de las
 * claves POI_KEYS (sin límite de resultados que trunque la búsqueda; una sola búsqueda por lugar, más rápida que tres
 * filtradas: 15 s frente a 23 s para 25 lugares), precedidos de un separador `make sep i=<n>` para repartirlos después.
 */
export function overpassBatchQuery(points: Array<{ latitude: number; longitude: number }>): string {
  const parts = points.map(
    ({ latitude, longitude }, i) =>
      `nwr(around:${RADIUS_M},${latitude},${longitude})["name"][~"^(${POI_KEYS.join('|')})$"~"."]->.p;make sep i=${i};out;.p out tags center;`,
  );
  return `[out:json][timeout:${60 + 10 * points.length}];${parts.join('')}`;
}

/** Reparte los elementos de una respuesta por lote entre sus lugares; null si faltan separadores. */
export function splitBatch(elements: Array<z.infer<typeof elementSchema>>, size: number): OsmElement[][] | null {
  const groups: OsmElement[][] = Array.from({ length: size }, () => []);
  const seen = new Set<number>();
  let current = -1;
  for (const el of elements) {
    if (el.type === 'sep') {
      current = Number(el.tags?.i);
      if (!Number.isInteger(current) || current < 0 || current >= size) return null;
      seen.add(current);
    } else if (current >= 0 && isOsmElement(el)) {
      groups[current]!.push(el);
    }
  }
  return seen.size === size ? groups : null;
}

function names(tags: Record<string, string>): string[] {
  return ['name', 'name:es', 'name:ca', 'name:en', 'alt_name', 'official_name', 'short_name', 'brand']
    .map((k) => tags[k])
    .filter((v): v is string => Boolean(v));
}

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export interface OsmPlaceIdentifierOptions {
  endpoint?: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Intervalo mínimo entre consultas (cortesía con la instancia pública). */
  minIntervalMs?: number;
  /** Lugares por consulta (por defecto OVERPASS_BATCH_SIZE). */
  batchSize?: number;
  /** Avisos de espera (servidor saturado), para que el worker muestre que sigue trabajando. */
  log?: (message: string) => void;
}

const cacheKey = (place: PlaceToIdentify) => `${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}:${normalizeTitle(place.name)}`;

export class OsmPlaceIdentifier {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, PlaceIdentification>();
  private readonly endpoint: string;
  private readonly interval: number;
  private readonly batchSize: number;
  private lastRequest = 0;

  constructor(private readonly options: OsmPlaceIdentifierOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.endpoint = options.endpoint ?? OVERPASS_DEFAULT_URL;
    this.interval = options.minIntervalMs ?? MIN_INTERVAL_MS;
    this.batchSize = options.batchSize ?? OVERPASS_BATCH_SIZE;
  }

  async identifyPlace(place: PlaceToIdentify): Promise<IdentifiedEntity | null> {
    return (await this.identifyPlaces([place]))[0]!.entity;
  }

  /** Identifica en lotes de `batchSize` lugares por consulta; lo ya consultado sale de la caché. */
  async identifyPlaces(places: PlaceToIdentify[], onProgress?: (done: number, total: number) => void): Promise<PlaceIdentification[]> {
    const found = new Map<string, PlaceIdentification>();
    for (const place of places) {
      const cached = this.cache.get(cacheKey(place));
      if (cached) found.set(cacheKey(place), cached);
    }
    const queue = [...new Map(places.filter((p) => !found.has(cacheKey(p))).map((p) => [cacheKey(p), p])).values()];
    let done = places.length - places.filter((p) => !found.has(cacheKey(p))).length;
    for (let start = 0; start < queue.length; start += this.batchSize) {
      const batch = queue.slice(start, start + this.batchSize);
      const results = await this.queryBatch(batch);
      if (this.cache.size > 5_000) this.cache.clear();
      batch.forEach((place, i) => {
        const match = matchPlace(place, results[i]!);
        found.set(cacheKey(place), match);
        this.cache.set(cacheKey(place), match);
      });
      const batchKeys = new Set(batch.map(cacheKey));
      done += places.filter((p) => batchKeys.has(cacheKey(p))).length;
      onProgress?.(done, places.length);
    }
    return places.map((place) => found.get(cacheKey(place))!);
  }

  /**
   * Overpass reparte «huecos» por IP (2 o 4 según el servidor al que envíe el balanceador, comprobado el 2026-10-09) y
   * responde 429 si no hay ninguno libre, o 504 si está saturado. Se reintenta con esperas crecientes (o lo que indique
   * `/api/status`, si es más) y solo se abandona, con un error reintentable, tras ~10 minutos sin respuesta.
   */
  private async queryBatch(batch: PlaceToIdentify[]): Promise<OsmElement[][]> {
    const wait = this.lastRequest + this.interval - Date.now();
    if (wait > 0) await this.sleep(wait);
    const body = new URLSearchParams({ data: overpassBatchQuery(batch) });
    let problem = '';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = problem === 'HTTP 429' ? Math.max(retryDelayMs(attempt - 1), await this.waitForSlot()) : retryDelayMs(attempt - 1);
        this.options.log?.(`OpenStreetMap ocupado (${problem}); reintento ${attempt}/${MAX_ATTEMPTS - 1} en ${Math.round(delay / 1000)} s`);
        await this.sleep(delay);
      }
      this.lastRequest = Date.now();
      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': this.options.userAgent },
          body,
          signal: AbortSignal.timeout(90_000 + 10_000 * batch.length),
        });
      } catch (error) {
        problem = (error as Error).name === 'TimeoutError' ? 'sin respuesta' : 'error de red';
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        problem = `HTTP ${response.status}`;
        continue;
      }
      if (!response.ok) throw new SourceError('bad_response', `OpenStreetMap (Overpass) respondió HTTP ${response.status}`, false);
      const parsed = overpassSchema.safeParse(await response.json().catch(() => null));
      // «runtime error» (consulta cortada por tiempo o memoria) o separadores incompletos: respuesta parcial, se repite.
      const groups = parsed.success && !/runtime error/i.test(parsed.data.remark ?? '') ? splitBatch(parsed.data.elements, batch.length) : null;
      if (groups) return groups;
      problem = 'respuesta incompleta';
    }
    throw new SourceError('unavailable', 'OpenStreetMap (Overpass) no responde; se reintentará', true);
  }

  /** Milisegundos hasta el siguiente hueco libre según `/api/status` (30 s si no se puede leer, como pide su wiki). */
  private async waitForSlot(): Promise<number> {
    try {
      const response = await this.fetchImpl(this.endpoint.replace(/\/interpreter$/, '/status'), {
        headers: { 'User-Agent': this.options.userAgent },
        signal: AbortSignal.timeout(15_000),
      });
      return slotWaitMs(await response.text());
    } catch {
      return 30_000;
    }
  }
}

/** Interpreta `/api/status` de Overpass: 1 s si hay huecos libres; si no, lo que falte para el primero (máx. 2 min). */
export function slotWaitMs(status: string): number {
  if (/^([1-9]\d*) slots? available now/m.test(status)) return 1_000;
  const waits = [...status.matchAll(/in (\d+) seconds?/g)].map((m) => Number(m[1]));
  return waits.length ? Math.min(Math.min(...waits) + 1, 120) * 1000 : 30_000;
}

/** Elige el elemento OSM que corresponde al lugar exportado, o null si no hay una coincidencia inequívoca. */
export function pickPlace(place: PlaceToIdentify, elements: OsmElement[]): IdentifiedEntity | null {
  return matchPlace(place, elements).entity;
}

/**
 * Como `pickPlace`, con el motivo si no se identifica:
 * - `out_of_scope`: lo que mejor coincide no es un restaurante ni un lugar cultural (un hotel, una tienda…). Se prefiere
 *   no importar a etiquetar un hotel como restaurante, aunque otro elemento coincida peor.
 * - `ambiguous`: varias coincidencias de categorías distintas, o varias solo por contención sin una notable.
 * - `no_match`: ningún elemento con ese nombre a ≤ 100 m.
 */
export function matchPlace(place: PlaceToIdentify, elements: OsmElement[]): PlaceIdentification {
  const exact = normalizeTitle(place.name);
  const stripped = stripGeneric(place.name);
  const origin = { lat: place.latitude, lon: place.longitude };
  /** El nombre de Google aparece completo, como frase, dentro del de OSM («Sagrada Família» ⊂ «Basílica de la Sagrada Família»). */
  const contains = (n: string) => exact.split(' ').length >= 2 && ` ${normalizeTitle(n)} `.includes(` ${exact} `);
  const matches = elements
    .map((el) => {
      const tags = el.tags ?? {};
      const at = el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : el.center;
      // Solo comercios, servicios y lugares (lo que pide la consulta): una estación o una calle homónimas no cuentan.
      if (!at || !POI_KEYS.some((k) => tags[k])) return null;
      const elementNames = names(tags);
      const tier = elementNames.some((n) => normalizeTitle(n) === exact)
        ? 3
        : stripped.length >= 3 && elementNames.some((n) => stripGeneric(n) === stripped)
          ? 2
          : elementNames.some(contains)
            ? 1
            : 0;
      if (!tier) return null;
      return { el, tags, kind: classifyOsmTags(tags), at, tier, distance: distanceM(origin, at) };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (!matches.length) return { entity: null, reason: 'no_match' };
  const topTier = Math.max(...matches.map((c) => c.tier));
  const top = matches.filter((c) => c.tier === topTier);
  // A igual coincidencia, cuenta el elemento de las categorías de APPINITY (un restaurante y su edificio con el mismo nombre).
  const candidates = top.flatMap((c) => (c.kind ? [{ ...c, kind: c.kind }] : []));
  if (!candidates.length) return { entity: null, reason: 'out_of_scope', scope: osmScope(top[0]!.tags) };
  if (new Set(candidates.map((c) => c.kind.category)).size > 1) return { entity: null, reason: 'ambiguous' };
  let best = candidates;
  if (topTier === 1 && best.length > 1) {
    // Solo por contención: se acepta el único candidato notable (con Wikidata); si no, es ambiguo.
    best = best.filter((c) => c.tags.wikidata);
    if (best.length !== 1) return { entity: null, reason: 'ambiguous' };
  }
  const chosen = best.sort((a, b) => a.distance - b.distance)[0]!;
  const wikidata = chosen.tags.wikidata && /^Q\d+$/.test(chosen.tags.wikidata) ? chosen.tags.wikidata : undefined;
  const confidence = topTier === 3 ? 0.95 : topTier === 2 ? 0.85 : candidates.length === 1 ? 0.75 : 0.7;
  const method = topTier === 3 ? 'osm_exact_name_100m' : topTier === 2 ? 'osm_name_sin_genericos_100m' : 'osm_nombre_contenido_100m';
  const entity: IdentifiedEntity = {
    category: chosen.kind.category,
    itemType: chosen.kind.itemType,
    title: place.name,
    canonicalIds: {
      [`osm:${chosen.el.type}`]: String(chosen.el.id),
      ...(wikidata ? { 'wikidata:entity': wikidata } : {}),
    },
    location: {
      latitude: chosen.at.lat,
      longitude: chosen.at.lon,
      ...(chosen.tags['addr:city'] ? { locality: chosen.tags['addr:city'] } : {}),
      ...(place.countryCode ? { countryCode: place.countryCode } : {}),
    },
    confidence,
    method,
  };
  return { entity };
}
