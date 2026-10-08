import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_META, isCategory } from '../src/index.js';

describe('categorías', () => {
  it('hay ocho categorías con código estable', () => {
    expect(CATEGORIES).toEqual(['food', 'movies', 'series', 'music', 'games', 'books', 'culture', 'podcasts']);
  });

  it('cada categoría tiene icono y color propios', () => {
    const colors = CATEGORIES.map((c) => CATEGORY_META[c].color);
    expect(new Set(colors).size).toBe(8);
    for (const c of CATEGORIES) expect(CATEGORY_META[c].icon).toMatch(/^[a-z-]+$/);
  });

  it('solo restaurantes y cultura se filtran por ubicación del objeto', () => {
    const local = CATEGORIES.filter((c) => CATEGORY_META[c].scope === 'local');
    expect(local).toEqual(['food', 'culture']);
  });

  it('música recomienda artistas y podcasts recomienda programas', () => {
    expect(CATEGORY_META.music.recommendedItemTypes).toEqual(['artist']);
    expect(CATEGORY_META.podcasts.recommendedItemTypes).toEqual(['podcast']);
  });

  it('isCategory valida en runtime', () => {
    expect(isCategory('games')).toBe(true);
    expect(isCategory('sports')).toBe(false);
    expect(isCategory(3)).toBe(false);
  });
});
