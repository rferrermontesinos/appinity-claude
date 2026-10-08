import { unzipSync } from 'fflate';
import { STAR_WORDS, type ResourceGroup } from './constants.js';
import type { ExportRecord, ExportedPlace } from './schemas.js';

/**
 * Resumen de la estructura de un export SIN datos personales: nombres de archivo, número de registros, claves vistas
 * y valores de campos enumerados. Sirve para comprobar el formato real frente al documentado.
 */
export interface ArchiveSummary {
  group: ResourceGroup;
  files: Array<{ path: string; bytes: number }>;
  records: number;
  skipped: number;
  keys: string[];
  enumValues: Record<string, string[]>;
  urlPatterns: string[];
}

/** Clave normalizada: sin mayúsculas, espacios ni guiones bajos («Search Query» → «searchquery»). */
const norm = (key: string) => key.toLowerCase().replace(/[\s_-]/g, '');

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  const wanted = new Set(keys.map(norm));
  for (const [key, value] of Object.entries(obj)) if (wanted.has(norm(key))) return value;
  return undefined;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** «Five stars», «5 estrellas», «4» o 4 → número 1–5; cualquier otra cosa → null. */
export function parseStars(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  const text = str(value)?.toLowerCase();
  if (!text) return null;
  const digit = /^(\d)\b/.exec(text);
  if (digit) return parseStars(Number(digit[1]));
  const word = /^(one|two|three|four|five)\b/.exec(text);
  return word ? STAR_WORDS[word[1]!]! : null;
}

/** Patrón de una URL sin datos: host y ruta con los dígitos y parámetros enmascarados. */
export function urlPattern(url: string): string {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.keys()].sort().map((k) => `${k}=…`).join('&');
    return `${u.host}${u.pathname.replace(/\d+/g, '#').replace(/[^/]{24,}/g, '…')}${params ? `?${params}` : ''}`;
  } catch {
    return 'url-no-válida';
  }
}

/** Recorre el JSON y devuelve los objetos que contienen alguna de las claves indicadas. */
function collectObjects(root: unknown, anyOf: string[]): Array<Record<string, unknown>> {
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

/** Lugar de Maps (GeoJSON documentado; se admite también el envoltorio `properties` de Takeout). */
function toPlace(feature: Record<string, unknown>): ExportedPlace | null {
  const props = (feature.properties as Record<string, unknown> | undefined) ?? feature;
  const rawLocation = pick(props, 'location');
  const location = (Array.isArray(rawLocation) ? rawLocation[0] : rawLocation) as Record<string, unknown> | undefined;
  const name = str(location && pick(location, 'name')) ?? str(pick(props, 'title', 'name'));
  const geometry = (feature.geometry ?? pick(props, 'geometry')) as { coordinates?: unknown } | undefined;
  const coords = Array.isArray(geometry?.coordinates) ? geometry!.coordinates : [];
  const [longitude, latitude] = coords.map(Number);
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) return null;
  const address = str(location && pick(location, 'address'));
  const countryCode = str(location && pick(location, 'country_code', 'countrycode'));
  const mapsUrl = str(pick(props, 'google_maps_url', 'googlemapsurl', 'url'));
  return {
    name,
    latitude: latitude!,
    longitude: longitude!,
    ...(address ? { address } : {}),
    ...(countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? { countryCode: countryCode.toUpperCase() } : {}),
    ...(mapsUrl ? { mapsUrl } : {}),
  };
}

function isoDate(value: unknown): string | undefined {
  const text = str(value);
  if (!text) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** Extrae los registros de un grupo a partir de los archivos JSON del export. */
export function extractRecords(group: ResourceGroup, jsonFiles: unknown[]): { records: ExportRecord[]; skipped: number; enums: Record<string, Set<string>>; keys: Set<string>; urls: Set<string> } {
  const records: ExportRecord[] = [];
  const enums: Record<string, Set<string>> = {};
  const keys = new Set<string>();
  const urls = new Set<string>();
  let skipped = 0;
  const noteEnum = (field: string, value: unknown) => {
    const text = str(value);
    if (text && text.length <= 40) (enums[field] ??= new Set()).add(text);
  };

  if (group === 'maps.reviews' || group === 'maps.starred_places') {
    for (const file of jsonFiles) {
      const features = collectObjects(file, ['geometry', 'location', 'properties']);
      for (const feature of features) {
        const props = (feature.properties as Record<string, unknown> | undefined) ?? feature;
        Object.keys(props).forEach((k) => keys.add(k));
        const place = toPlace(feature);
        if (!place) {
          skipped++;
          continue;
        }
        if (place.mapsUrl) urls.add(place.mapsUrl);
        const date = isoDate(pick(props, 'date', 'published', 'updated'));
        if (group === 'maps.starred_places') {
          records.push({ group, place, ...(date ? { date } : {}) });
          continue;
        }
        const published = pick(props, 'five_star_rating_published', 'starrating');
        noteEnum('five_star_rating_published', published);
        records.push({
          group,
          place,
          rating: parseStars(published),
          hasText: Boolean(str(pick(props, 'review_text_published'))),
          ...(date ? { date } : {}),
        });
      }
    }
  } else {
    for (const file of jsonFiles) {
      for (const obj of collectObjects(file, ['Search Query'])) {
        Object.keys(obj).forEach((k) => keys.add(k));
        const query = str(pick(obj, 'Search Query'));
        if (!query) {
          skipped++;
          continue;
        }
        const date = isoDate(pick(obj, 'Updated')) ?? isoDate(pick(obj, 'Published'));
        if (group === 'search_ugc.media.thumbs') {
          const raw = pick(obj, 'Thumbs Rating');
          noteEnum('Thumbs Rating', raw);
          const text = str(raw)?.toLowerCase() ?? '';
          const thumb = text.includes('up') ? 'up' : text.includes('down') ? 'down' : null;
          records.push({ group, query, thumb, ...(date ? { date } : {}) });
        } else if (group === 'search_ugc.media.reviews_and_stars') {
          const raw = pick(obj, 'Review Star Rating');
          noteEnum('Review Star Rating', raw);
          records.push({ group, query, stars: parseStars(raw), ...(date ? { date } : {}) });
        } else {
          records.push({ group, query, ...(date ? { date } : {}) });
        }
      }
    }
  }
  return { records, skipped, enums, keys, urls };
}

/** Descomprime un archivo ZIP del export y devuelve sus JSON (los demás archivos solo cuentan en el resumen). */
export function readArchive(group: ResourceGroup, zips: Uint8Array[]): { records: ExportRecord[]; summary: ArchiveSummary } {
  const files: ArchiveSummary['files'] = [];
  const json: unknown[] = [];
  for (const zip of zips) {
    const entries = unzipSync(zip);
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith('/')) continue;
      files.push({ path, bytes: data.byteLength });
      if (path.toLowerCase().endsWith('.json') || path.toLowerCase().endsWith('.geojson')) {
        try {
          json.push(JSON.parse(new TextDecoder().decode(data)));
        } catch {
          // Un archivo ilegible se refleja en el resumen (0 registros), no rompe el resto.
        }
      }
    }
  }
  const { records, skipped, enums, keys, urls } = extractRecords(group, json);
  return {
    records,
    summary: {
      group,
      files,
      records: records.length,
      skipped,
      keys: [...keys].sort(),
      enumValues: Object.fromEntries(Object.entries(enums).map(([k, v]) => [k, [...v].sort()])),
      urlPatterns: [...new Set([...urls].map(urlPattern))].sort().slice(0, 10),
    },
  };
}
