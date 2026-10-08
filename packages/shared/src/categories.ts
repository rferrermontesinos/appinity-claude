/** Ocho categorías del MVP. El código es estable y se usa en BD, API y móvil. */
export const CATEGORIES = ['food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts'] as const;

export type Category = (typeof CATEGORIES)[number];

export type CategoryScope = 'local' | 'global';

export interface CategoryMeta {
  code: Category;
  /** Local: el objeto se filtra por distancia a la ubicación del usuario. */
  scope: CategoryScope;
  /** Tipo de objeto recomendable (música recomienda artistas; podcasts, programas). */
  recommendedItemTypes: readonly string[];
  /** Color propio de la categoría (hex). */
  color: string;
  /** Nombre de icono de MaterialCommunityIcons (@expo/vector-icons). */
  icon: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  food: { code: 'food', scope: 'local', recommendedItemTypes: ['restaurant'], color: '#E4572E', icon: 'silverware-fork-knife' },
  movies: { code: 'movies', scope: 'global', recommendedItemTypes: ['movie'], color: '#7B4BD6', icon: 'movie-open' },
  series: { code: 'series', scope: 'global', recommendedItemTypes: ['series', 'season'], color: '#2E86DE', icon: 'television-classic' },
  music: { code: 'music', scope: 'global', recommendedItemTypes: ['artist'], color: '#E0367A', icon: 'music' },
  games: { code: 'games', scope: 'global', recommendedItemTypes: ['game'], color: '#2BAE66', icon: 'gamepad-variant' },
  books: { code: 'books', scope: 'global', recommendedItemTypes: ['book'], color: '#A0522D', icon: 'book-open-variant' },
  culture: { code: 'culture', scope: 'local', recommendedItemTypes: ['venue', 'museum', 'event'], color: '#D4A017', icon: 'bank' },
  podcasts: { code: 'podcasts', scope: 'global', recommendedItemTypes: ['podcast'], color: '#0F9D9A', icon: 'podcast' },
};

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
