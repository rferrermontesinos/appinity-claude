import { CATEGORIES, type Category } from '@appinity/shared';

/**
 * Orden personal del mosaico de categorías (2026-10-26). Explicable y sin inventar nada:
 * - Afinidad (60 %): media de la afinidad de esa categoría con tus almas gemelas más afines (0–100). Es lo que hace
 *   fiables las recomendaciones de esa categoría.
 * - Gusto propio (40 %): cuántos objetos de esa categoría te gustan según tus fuentes, con tope.
 * Sin almas gemelas, ordena el gusto propio; sin nada, el orden por defecto (`CATEGORIES`).
 */
export const CATEGORY_RANKING_VERSION = 'category-ranking-v1';
export const CATEGORY_RANKING_PARAMS = { affinityWeight: 0.6, likesWeight: 0.4, likesCap: 30 } as const;

export interface CategorySignals {
  category: Category;
  /** Afinidad de esa categoría con cada alma gemela considerada (0–100). Vacío si no hay evidencia comparable. */
  affinities: readonly number[];
  /** Objetos de la categoría que te gustan (preferencia positiva). */
  likes: number;
}

export interface RankedCategory {
  category: Category;
  score: number;
  /** Media de afinidad (0–100) o NULL si no hay almas gemelas con evidencia en esa categoría. */
  affinity: number | null;
  likes: number;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function rankCategories(signals: readonly CategorySignals[], params = CATEGORY_RANKING_PARAMS): RankedCategory[] {
  const byCategory = new Map(signals.map((s) => [s.category, s]));
  const ranked = CATEGORIES.map((category, defaultIndex) => {
    const s = byCategory.get(category);
    const affinity = s && s.affinities.length ? s.affinities.reduce((a, b) => a + b, 0) / s.affinities.length : null;
    const likes = s?.likes ?? 0;
    const score = (affinity ?? 0) / 100 * params.affinityWeight + (Math.min(likes, params.likesCap) / params.likesCap) * params.likesWeight;
    return { category, score: round(score), affinity: affinity === null ? null : Math.round(affinity), likes, defaultIndex };
  });
  // Empates (incluido «sin datos»): orden por defecto, para que sea estable.
  ranked.sort((a, b) => b.score - a.score || a.defaultIndex - b.defaultIndex);
  return ranked.map(({ defaultIndex: _defaultIndex, ...rest }) => rest);
}
