import type { EntityIdentifier, PlaceIdentification, PlaceTextToIdentify, PlaceToIdentify } from '@appinity/shared';
import { NominatimGeocoder } from './nominatim.js';
import { OsmPlaceIdentifier } from './osm-places.js';
import { WikidataWorkIdentifier } from './wikidata-works.js';

export interface CatalogIdentifierOptions {
  /** User-Agent identificable que exigen Wikimedia y Overpass (nombre de la app y contacto). */
  userAgent: string;
  overpassUrl?: string;
  wikidataUrl?: string;
  nominatimUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Avisos de espera de los catálogos (servidor saturado). */
  log?: (message: string) => void;
}

/** Lugares geocodificados (sin coordenadas en el export): la posición es aproximada, así que pesan algo menos. */
export const GEOCODED_CONFIDENCE_FACTOR = 0.9;

/** Identificador de catálogo: lugares con OpenStreetMap y obras con Wikidata. Ambos con licencias de uso comercial. */
export function createCatalogIdentifier(options: CatalogIdentifierOptions): EntityIdentifier {
  const common = {
    userAgent: options.userAgent,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  };
  const places = new OsmPlaceIdentifier({
    ...common,
    ...(options.overpassUrl ? { endpoint: options.overpassUrl } : {}),
    ...(options.log ? { log: options.log } : {}),
  });
  const works = new WikidataWorkIdentifier({
    ...common,
    ...(options.wikidataUrl ? { endpoint: options.wikidataUrl } : {}),
    ...(options.log ? { log: options.log } : {}),
  });
  const geocoder = new NominatimGeocoder({
    ...common,
    ...(options.nominatimUrl ? { endpoint: options.nominatimUrl } : {}),
    ...(options.log ? { log: options.log } : {}),
  });
  // Nominatim y, si no encuentra un sitio concreto, Wikidata (coordenadas de lugares notables: ruinas, monumentos…).
  const chained = {
    geocode: async (place: PlaceTextToIdentify) => (await geocoder.geocode(place)) ?? (await works.locatePlace(place.name)),
  };
  return {
    identifyPlacesByText: (list, onProgress) => identifyPlacesByText(list, chained, (points) => places.identifyPlaces(points), onProgress),
    identifyApps: (packages, onProgress) => works.identifyApps(packages, onProgress),
    identifyGoogleBooksVolume: (volumeId) => works.identifyGoogleBooksVolume(volumeId),
    identifyByExternalIds: (items) => works.identifyByExternalIds(items),
    relatedWorks: (qid, category) => works.relatedWorks(qid, category),
    popularWorks: (category, offset, limit) => works.popularWorks(category, offset, limit),
    identifyPlace: (place) => places.identifyPlace(place),
    identifyPlaces: (list, onProgress) => places.identifyPlaces(list, onProgress),
    identifyWork: (work) => works.identifyWork(work),
    identifyChannels: (channels, onProgress) => works.identifyChannels(channels, onProgress),
    identifyArtists: (names, onProgress) => works.identifyArtists(names, onProgress),
  };
}

/**
 * Lugares sin coordenadas: geocodificación (nombre y dirección) y, con esa posición, la misma comprobación de nombre y
 * tipo que los lugares con coordenadas. Sin resultado del geocodificador: sin coincidencia.
 */
export async function identifyPlacesByText(
  list: PlaceTextToIdentify[],
  geocoder: { geocode(place: PlaceTextToIdentify): Promise<{ latitude: number; longitude: number; countryCode?: string } | null> },
  identifyPlaces: (points: PlaceToIdentify[]) => Promise<PlaceIdentification[]>,
  onProgress?: (done: number, total: number) => void,
): Promise<PlaceIdentification[]> {
  const located: Array<{ index: number; point: PlaceToIdentify }> = [];
  for (const [index, place] of list.entries()) {
    const position = await geocoder.geocode(place);
    if (position) {
      const countryCode = position.countryCode ?? place.countryCode;
      located.push({ index, point: { name: place.name, latitude: position.latitude, longitude: position.longitude, ...(countryCode ? { countryCode } : {}) } });
    }
    if ((index + 1) % 10 === 0 || index + 1 === list.length) onProgress?.(index + 1, list.length);
  }
  const results: PlaceIdentification[] = list.map(() => ({ entity: null, reason: 'no_match', nearby: 'none' }));
  const matched = located.length ? await identifyPlaces(located.map((l) => l.point)) : [];
  located.forEach(({ index }, i) => {
    const result = matched[i]!;
    results[index] = result.entity
      ? {
          entity: {
            ...result.entity,
            confidence: Math.round(result.entity.confidence * GEOCODED_CONFIDENCE_FACTOR * 1000) / 1000,
            method: `geocodificado_${result.entity.method}`,
          },
        }
      : result;
  });
  return results;
}
