import type { EntityIdentifier } from '@appinity/shared';
import { OsmPlaceIdentifier } from './osm-places.js';
import { WikidataWorkIdentifier } from './wikidata-works.js';

export interface CatalogIdentifierOptions {
  /** User-Agent identificable que exigen Wikimedia y Overpass (nombre de la app y contacto). */
  userAgent: string;
  overpassUrl?: string;
  wikidataUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Avisos de espera de los catálogos (servidor saturado). */
  log?: (message: string) => void;
}

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
  const works = new WikidataWorkIdentifier({ ...common, ...(options.wikidataUrl ? { endpoint: options.wikidataUrl } : {}) });
  return {
    identifyPlace: (place) => places.identifyPlace(place),
    identifyPlaces: (list, onProgress) => places.identifyPlaces(list, onProgress),
    identifyWork: (work) => works.identifyWork(work),
  };
}
