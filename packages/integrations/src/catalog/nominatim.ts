import { SourceError, normalizeTitle, type PlaceTextToIdentify } from '@appinity/shared';
import { z } from 'zod';
import { descriptorHead } from './osm-places.js';

/**
 * Geocodificación con Nominatim (OpenStreetMap) para lugares exportados sin coordenadas: pedidos y reservas de comida
 * y lugares guardados de Google. Solo da coordenadas aproximadas: la identificación definitiva la hace después
 * `OsmPlaceIdentifier` (nombre y tipo del elemento de OSM a ≤ 100 m).
 *
 * Política de la instancia pública (comprobada el 2026-10-14, operations.osmfoundation.org/policies/nominatim):
 * máximo 1 petición por segundo, User-Agent identificable, resultados en caché y nada de geocodificación masiva ni
 * periódica. Por eso: una petición por segundo como mucho, caché por consulta, un tope de lugares por sync y el endpoint
 * configurable (`NOMINATIM_URL`). En producción con muchos usuarios se usará una instancia propia (software libre,
 * datos ODbL), no la pública.
 */
export const NOMINATIM_DEFAULT_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1_100;
const ATTEMPTS = 4;
/**
 * Clases de OSM que son un sitio concreto. Al buscar por nombre, Nominatim devuelve a veces una ciudad, una calle o una
 * región homónima (82 de 166 lugares guardados reales quedaban «sin lugares cerca», 2026-10-15): se descartan.
 */
const POI_CATEGORIES = new Set(['amenity', 'tourism', 'historic', 'leisure', 'shop', 'craft', 'building', 'man_made', 'natural', 'office', 'club']);

const resultSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    name: z.string().optional(),
    category: z.string().optional(),
    address: z.object({ country_code: z.string().optional() }).passthrough().optional(),
  }),
);

export interface GeocodedPlace {
  latitude: number;
  longitude: number;
  countryCode?: string;
}

export interface NominatimGeocoderOptions {
  endpoint?: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  log?: (message: string) => void;
}

/**
 * Consultas en orden de precisión. Nominatim no encuentra nada si se mezclan nombre y dirección completa (comprobado el
 * 2026-10-14 con un restaurante real), pero sí con la dirección sola o con nombre y ciudad. Con dirección: la dirección
 * y, si falla, nombre + ciudad (último tramo de la dirección). Sin dirección: el nombre. Después OSM exige un lugar con
 * ese nombre a ≤ 100 m, así que una posición equivocada no identifica nada.
 */
export function geocodeQueries(place: PlaceTextToIdentify): string[] {
  // Sin descriptor de marketing («Agreste | Restaurante gastronómico Barcelona» → «Agreste»): Nominatim no lo encuentra.
  const name = (descriptorHead(place.name) ?? place.name).trim();
  const address = place.address?.trim();
  if (!address) return name ? [name] : [];
  const city = address
    .split(',')
    .map((part) => part.replace(/\b\d{4,6}\b/g, '').trim())
    .filter(Boolean)
    .at(-1);
  const queries = [address, ...(name && city && normalizeTitle(city) !== normalizeTitle(address) ? [`${name}, ${city}`] : [])];
  return [...new Set(queries)];
}

export class NominatimGeocoder {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, GeocodedPlace | null>();
  private lastRequest = 0;

  constructor(private readonly options: NominatimGeocoderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async geocode(place: PlaceTextToIdentify): Promise<GeocodedPlace | null> {
    const address = place.address?.trim();
    for (const q of geocodeQueries(place)) {
      // La dirección sola puede ser un edificio o una calle; por nombre, solo un sitio concreto.
      const found = await this.search(q, place.countryCode, q !== address);
      if (found) return found;
    }
    return null;
  }

  private async search(q: string, countryCode: string | undefined, poiOnly: boolean): Promise<GeocodedPlace | null> {
    const key = `${poiOnly ? 'poi' : 'any'}:${countryCode ?? ''}:${normalizeTitle(q)}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const url = new URL(this.options.endpoint ?? NOMINATIM_DEFAULT_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', poiOnly ? '5' : '1');
    url.searchParams.set('addressdetails', '1');
    if (countryCode) url.searchParams.set('countrycodes', countryCode.toLowerCase());
    let problem = '';
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const wait = this.lastRequest + (this.options.minIntervalMs ?? MIN_INTERVAL_MS) - Date.now();
      if (attempt > 0) {
        const delay = 2_000 * 2 ** attempt;
        this.options.log?.(`Nominatim ocupado (${problem}); reintento ${attempt}/${ATTEMPTS - 1} en ${Math.round(delay / 1000)} s`);
        await this.sleep(delay);
      } else if (wait > 0) {
        await this.sleep(wait);
      }
      this.lastRequest = Date.now();
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json', 'Accept-Language': 'es,en' },
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        problem = (error as Error).name === 'TimeoutError' ? 'sin respuesta' : 'error de red';
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        problem = `HTTP ${response.status}`;
        continue;
      }
      if (!response.ok) throw new SourceError('bad_response', `Nominatim respondió HTTP ${response.status}`, false);
      const parsed = resultSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        problem = 'respuesta ilegible';
        continue;
      }
      const first = poiOnly ? parsed.data.find((r) => POI_CATEGORIES.has(r.category ?? '')) : parsed.data[0];
      const result: GeocodedPlace | null = first
        ? {
            latitude: Number(first.lat),
            longitude: Number(first.lon),
            ...(first.address?.country_code ? { countryCode: first.address.country_code.toUpperCase() } : {}),
          }
        : null;
      const valid = result && Number.isFinite(result.latitude) && Number.isFinite(result.longitude) ? result : null;
      if (this.cache.size > 5_000) this.cache.clear();
      this.cache.set(key, valid);
      return valid;
    }
    throw new SourceError('unavailable', 'Nominatim no responde; se reintentará', true);
  }
}

export interface GeocodedCity {
  label: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

/**
 * Ciudad escrita por la persona en el alta → coordenadas aproximadas (centro de la población). Solo asentamientos
 * (ciudad, pueblo, municipio): nunca una calle ni un comercio. Una petición, dentro del límite de 1/s de Nominatim.
 */
export async function geocodeCity(
  name: string,
  options: { userAgent: string; endpoint?: string; fetchImpl?: typeof fetch; language?: string },
): Promise<GeocodedCity | null> {
  const query = name.trim();
  if (query.length < 2) return null;
  const url = new URL(options.endpoint ?? NOMINATIM_DEFAULT_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('featureType', 'settlement');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { 'User-Agent': options.userAgent, Accept: 'application/json', 'Accept-Language': options.language ?? 'es,en' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Nominatim respondió HTTP ${response.status}`);
  const [hit] = (await response.json()) as Array<{ lat: string; lon: string; name?: string; display_name?: string; address?: Record<string, string> }>;
  if (!hit) return null;
  const a = hit.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? hit.name ?? query;
  const label = [city, a.country].filter(Boolean).join(', ');
  return { label, latitude: Number(hit.lat), longitude: Number(hit.lon), ...(a.country_code ? { countryCode: a.country_code.toUpperCase() } : {}) };
}
