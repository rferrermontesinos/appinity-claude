import type { Category } from '@appinity/shared';

export interface ExternalLink {
  provider: string;
  url: string;
}

interface IdRef {
  provider: string;
  idType: string;
  value: string;
}

/**
 * Plantillas de enlace por proveedor y tipo de ID. Cada ID se valida con su patrón antes de construir la URL (https,
 * dominio fijo): un ID inesperado no genera enlace. Los IDs internos (fixtures, exportaciones, Freebase…) no tienen
 * página pública y no aparecen aquí.
 */
const TEMPLATES: Record<string, { pattern: RegExp; url: (id: string) => string }> = {
  'steam:app': { pattern: /^\d{1,10}$/, url: (id) => `https://store.steampowered.com/app/${id}/` },
  'spotify:artist': { pattern: /^[A-Za-z0-9]{22}$/, url: (id) => `https://open.spotify.com/artist/${id}` },
  'spotify:show': { pattern: /^[A-Za-z0-9]{22}$/, url: (id) => `https://open.spotify.com/show/${id}` },
  'apple_music:artist': { pattern: /^\d{1,12}$/, url: (id) => `https://music.apple.com/artist/${id}` },
  'apple_podcasts:podcast': { pattern: /^\d{1,12}$/, url: (id) => `https://podcasts.apple.com/podcast/id${id}` },
  'youtube:channel': { pattern: /^UC[A-Za-z0-9_-]{22}$/, url: (id) => `https://www.youtube.com/channel/${id}` },
  'google_maps:cid': { pattern: /^\d{1,20}$/, url: (id) => `https://maps.google.com/?cid=${id}` },
  'osm:node': { pattern: /^\d{1,12}$/, url: (id) => `https://www.openstreetmap.org/node/${id}` },
  'osm:way': { pattern: /^\d{1,12}$/, url: (id) => `https://www.openstreetmap.org/way/${id}` },
  'osm:relation': { pattern: /^\d{1,12}$/, url: (id) => `https://www.openstreetmap.org/relation/${id}` },
  'imdb:title': { pattern: /^tt\d{5,10}$/, url: (id) => `https://www.imdb.com/title/${id}/` },
  'openlibrary:work': { pattern: /^OL\d{1,10}W$/, url: (id) => `https://openlibrary.org/works/${id}` },
  'goodreads:work': { pattern: /^\d{1,12}$/, url: (id) => `https://www.goodreads.com/work/editions/${id}` },
  'musicbrainz:artist': { pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, url: (id) => `https://musicbrainz.org/artist/${id}` },
  'discogs:artist': { pattern: /^\d{1,10}$/, url: (id) => `https://www.discogs.com/artist/${id}` },
  'anilist:manga': { pattern: /^\d{1,10}$/, url: (id) => `https://anilist.co/manga/${id}` },
  'anilist:anime': { pattern: /^\d{1,10}$/, url: (id) => `https://anilist.co/anime/${id}` },
  'igdb:game': { pattern: /^[a-z0-9-]{1,100}$/, url: (id) => `https://www.igdb.com/games/${id}` },
  'wikidata:entity': { pattern: /^Q\d{1,12}$/, url: (id) => `https://www.wikidata.org/wiki/${id}` },
};

/**
 * Orden por categoría: primero donde se consume (escuchar, jugar, ir), después referencias y, al final, Wikidata.
 * Un proveedor no listado va antes de Wikidata.
 */
const PRIORITY: Record<Category, string[]> = {
  food: ['google_maps', 'website', 'osm', 'wikipedia'],
  culture: ['google_maps', 'website', 'osm', 'wikipedia'],
  music: ['spotify', 'apple_music', 'youtube', 'website', 'musicbrainz', 'discogs', 'wikipedia'],
  podcasts: ['spotify', 'apple_podcasts', 'youtube', 'website', 'wikipedia'],
  games: ['steam', 'website', 'igdb', 'wikipedia'],
  movies: ['imdb', 'website', 'wikipedia', 'tmdb'],
  series: ['imdb', 'website', 'wikipedia', 'tmdb'],
  books: ['openlibrary', 'goodreads', 'anilist', 'website', 'wikipedia'],
};

/**
 * Enlaces públicos de un objeto: los guardados en el catálogo más los que se derivan de sus IDs externos, sin
 * duplicar proveedor, solo https y en el orden de su categoría. Si es un lugar sin enlace de mapa, una búsqueda en
 * Google Maps por su nombre y localidad (así abre la ficha del sitio, no una chincheta); sin localidad, por sus
 * coordenadas. Datos públicos del objeto, nunca del usuario.
 */
export function publicLinks(
  category: Category,
  ids: readonly IdRef[],
  stored: readonly ExternalLink[],
  place: { name: string; latitude: number; longitude: number; locality: string | null } | null = null,
): ExternalLink[] {
  const byProvider = new Map<string, ExternalLink>();
  for (const l of stored) if (l.url.startsWith('https://') && !byProvider.has(l.provider)) byProvider.set(l.provider, l);
  for (const id of ids) {
    const tpl = TEMPLATES[`${id.provider}:${id.idType}`];
    if (!tpl || !tpl.pattern.test(id.value) || byProvider.has(id.provider)) continue;
    byProvider.set(id.provider, { provider: id.provider, url: tpl.url(id.value) });
  }
  if (place && (category === 'food' || category === 'culture') && !byProvider.has('google_maps')) {
    const query = place.locality ? `${place.name}, ${place.locality}` : `${place.latitude.toFixed(6)},${place.longitude.toFixed(6)}`;
    byProvider.set('google_maps', { provider: 'google_maps', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` });
  }
  const order = PRIORITY[category];
  const rank = (p: string) => (p === 'wikidata' ? 1000 : order.includes(p) ? order.indexOf(p) : 500);
  return [...byProvider.values()].sort((a, b) => rank(a.provider) - rank(b.provider) || a.provider.localeCompare(b.provider));
}
