import { CATEGORY_META, type Category, type CatalogImage } from '@appinity/shared';

const LABELS: Record<Category, string> = {
  food: 'Restaurantes',
  movies: 'Películas',
  series: 'Series',
  music: 'Música',
  games: 'Videojuegos',
  books: 'Libros',
  culture: 'Cultura',
  podcasts: 'Podcasts',
};

export const FALLBACK_IMAGE_SOURCE = 'appinity_fallback';

/**
 * Imagen de sustitución de la categoría. Es un diseño propio (color e identificador de la categoría), nunca
 * una fotografía fabricada del contenido.
 */
export function fallbackImage(category: Category, baseUrl: string): CatalogImage {
  return {
    url: `${baseUrl}/static/fallback/${category}.svg`,
    source: FALLBACK_IMAGE_SOURCE,
    alt: `Sin imagen disponible · ${LABELS[category]}`,
    width: 600,
    height: 900,
    isFallback: true,
  };
}

export function renderFallbackSvg(category: Category): string {
  const color = CATEGORY_META[category].color;
  const label = LABELS[category];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900" role="img" aria-label="Sin imagen disponible · ${label}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <circle cx="300" cy="380" r="120" fill="#ffffff" fill-opacity="0.18"/>
  <text x="300" y="400" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="700" fill="#ffffff">${label.slice(0, 1)}</text>
  <text x="300" y="600" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="#ffffff">${label}</text>
  <text x="300" y="660" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#ffffff" fill-opacity="0.85">Sin imagen disponible</text>
</svg>`;
}
