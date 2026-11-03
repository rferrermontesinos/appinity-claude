import { CATEGORIES } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { rankCategories } from '../src/category-ranking.js';

describe('orden personal de categorías', () => {
  it('sin datos, el orden por defecto; con datos, primero donde más afinidad y gusto hay', () => {
    expect(rankCategories([]).map((r) => r.category)).toEqual([...CATEGORIES]);
    const ranked = rankCategories([
      { category: 'games', affinities: [90, 80], likes: 30 },
      { category: 'music', affinities: [60], likes: 5 },
      { category: 'books', affinities: [], likes: 12 },
    ]);
    expect(ranked.slice(0, 3).map((r) => r.category)).toEqual(['games', 'music', 'books']);
    expect(ranked[0]).toEqual({ category: 'games', score: 0.91, affinity: 85, likes: 30 });
    // Sin almas gemelas en esa categoría, la afinidad es NULL (no 0) y solo cuenta el gusto propio.
    expect(ranked[2]).toMatchObject({ affinity: null, likes: 12, score: 0.16 });
  });

  it('el gusto propio tiene tope: muchos objetos no tapan una afinidad alta', () => {
    const ranked = rankCategories([
      { category: 'music', affinities: [], likes: 500 },
      { category: 'movies', affinities: [95, 95], likes: 10 },
    ]);
    expect(ranked[0]!.category).toBe('movies');
  });
});
