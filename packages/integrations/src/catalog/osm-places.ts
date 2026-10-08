import { SourceError, normalizeTitle, type Category, type IdentifiedEntity } from '@appinity/shared';
import { z } from 'zod';

/**
 * Identificación de lugares con OpenStreetMap (Overpass API). OSM: datos bajo ODbL, uso comercial permitido con la
 * atribución «© OpenStreetMap contributors»; solo se guarda la categoría y el identificador del elemento. La instancia
 * pública de Overpass pide un uso moderado (≈10.000 consultas/día): para producción se usará una instancia propia o un
 * proveedor (decisions.md).
 *
 * Regla de identificación: elementos con nombre a ≤ 100 m de las coordenadas exportadas por Google cuyo nombre
 * normalizado coincide EXACTAMENTE (o tras quitar palabras genéricas como «restaurante» o «museo»). Si hay varias
 * coincidencias de categorías distintas, no se identifica.
 */
export const OVERPASS_DEFAULT_URL = 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 100;
const MIN_INTERVAL_MS = 1_100;

const overpassSchema = z.object({
  elements: z.array(
    z.object({
      type: z.enum(['node', 'way', 'relation']),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
});
type OsmElement = z.infer<typeof overpassSchema>['elements'][number];

const FOOD_AMENITIES = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'ice_cream', 'biergarten']);
const CULTURE_AMENITIES = new Set(['theatre', 'cinema', 'arts_centre', 'concert_hall', 'planetarium']);
const CULTURE_TOURISM = new Set(['museum', 'gallery']);
const CULTURE_HISTORIC = new Set(['castle', 'monument', 'archaeological_site']);

/** Palabras genéricas que Google y OSM ponen o quitan del nombre («Restaurante Can Pep» ↔ «Can Pep»). */
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
  // Monumentos visitables: atracción o templo con valor histórico o patrimonial (p. ej. la Sagrada Família).
  const landmark = Boolean(tags.historic || tags.heritage);
  if (landmark && (tags.tourism === 'attraction' || tags.amenity === 'place_of_worship')) return { category: 'culture', itemType: 'venue' };
  return null;
}

/** Consulta Overpass acotada a restaurantes y lugares culturales (sin límite de resultados que trunque la búsqueda). */
export function overpassQuery(lat: number, lon: number): string {
  const around = `(around:${RADIUS_M},${lat},${lon})["name"]`;
  return [
    '[out:json][timeout:25];(',
    `nwr${around}["amenity"~"^(${[...FOOD_AMENITIES, ...CULTURE_AMENITIES, 'place_of_worship'].join('|')})$"];`,
    `nwr${around}["tourism"~"^(${[...CULTURE_TOURISM, 'attraction'].join('|')})$"];`,
    `nwr${around}["historic"];`,
    ');out tags center;',
  ].join('');
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
}

export class OsmPlaceIdentifier {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, IdentifiedEntity | null>();
  private lastRequest = 0;

  constructor(private readonly options: OsmPlaceIdentifierOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async identifyPlace(place: { name: string; latitude: number; longitude: number; countryCode?: string }): Promise<IdentifiedEntity | null> {
    const key = `${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}:${normalizeTitle(place.name)}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const elements = await this.query(place.latitude, place.longitude);
    const result = pickPlace(place, elements);
    if (this.cache.size > 5_000) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }

  private async query(lat: number, lon: number): Promise<OsmElement[]> {
    const wait = this.lastRequest + (this.options.minIntervalMs ?? MIN_INTERVAL_MS) - Date.now();
    if (wait > 0) await this.sleep(wait);
    const body = new URLSearchParams({ data: overpassQuery(lat, lon) });
    for (let attempt = 0; attempt < 3; attempt++) {
      this.lastRequest = Date.now();
      let response: Response;
      try {
        response = await this.fetchImpl(this.options.endpoint ?? OVERPASS_DEFAULT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': this.options.userAgent },
          body,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        await this.sleep(2_000 * 2 ** attempt);
        continue;
      }
      // La wiki de Overpass pide pausar 30 s tras un 429; los 5xx se reintentan con espera creciente.
      if (response.status === 429 || response.status === 504 || response.status >= 500) {
        await this.sleep(response.status === 429 ? 30_000 : 5_000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new SourceError('bad_response', `OpenStreetMap (Overpass) respondió HTTP ${response.status}`, false);
      const parsed = overpassSchema.safeParse(await response.json());
      if (!parsed.success) throw new SourceError('bad_response', 'Respuesta inesperada de OpenStreetMap (Overpass)', false);
      return parsed.data.elements;
    }
    throw new SourceError('unavailable', 'OpenStreetMap (Overpass) no responde; se reintentará', true);
  }
}

/** Elige el elemento OSM que corresponde al lugar exportado, o null si no hay una coincidencia inequívoca. */
export function pickPlace(
  place: { name: string; latitude: number; longitude: number; countryCode?: string },
  elements: OsmElement[],
): IdentifiedEntity | null {
  const exact = normalizeTitle(place.name);
  const stripped = stripGeneric(place.name);
  const origin = { lat: place.latitude, lon: place.longitude };
  /** El nombre de Google aparece completo, como frase, dentro del de OSM («Sagrada Família» ⊂ «Basílica de la Sagrada Família»). */
  const contains = (n: string) => exact.split(' ').length >= 2 && ` ${normalizeTitle(n)} `.includes(` ${exact} `);
  const candidates = elements
    .map((el) => {
      const tags = el.tags ?? {};
      const kind = classifyOsmTags(tags);
      const at = el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : el.center;
      if (!kind || !at) return null;
      const elementNames = names(tags);
      const tier = elementNames.some((n) => normalizeTitle(n) === exact)
        ? 3
        : stripped.length >= 3 && elementNames.some((n) => stripGeneric(n) === stripped)
          ? 2
          : elementNames.some(contains)
            ? 1
            : 0;
      if (!tier) return null;
      return { el, tags, kind, at, tier, distance: distanceM(origin, at) };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (!candidates.length) return null;
  const topTier = Math.max(...candidates.map((c) => c.tier));
  let best = candidates.filter((c) => c.tier === topTier);
  if (new Set(best.map((c) => c.kind.category)).size > 1) return null;
  if (topTier === 1 && best.length > 1) {
    // Solo por contención: se acepta el único candidato notable (con Wikidata); si no, es ambiguo.
    best = best.filter((c) => c.tags.wikidata);
    if (best.length !== 1) return null;
  }
  const chosen = best.sort((a, b) => a.distance - b.distance)[0]!;
  const wikidata = chosen.tags.wikidata && /^Q\d+$/.test(chosen.tags.wikidata) ? chosen.tags.wikidata : undefined;
  const confidence = topTier === 3 ? 0.95 : topTier === 2 ? 0.85 : candidates.filter((c) => c.tier === 1).length === 1 ? 0.75 : 0.7;
  const method = topTier === 3 ? 'osm_exact_name_100m' : topTier === 2 ? 'osm_name_sin_genericos_100m' : 'osm_nombre_contenido_100m';
  return {
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
}
