import type { Category } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import {
  AFFINITY_PARAMS_V1,
  AFFINITY_VERSION,
  affinity,
  categoryAffinity,
  indexPreferences,
  isExceptionalMutual,
  type PreferencePoint,
} from '../src/affinity.js';

/**
 * Perfiles SINTÉTICOS (no derivan de ninguna persona real): n objetos de una categoría con una puntuación y una
 * confianza. `offset` desplaza los ids para crear historiales que solo se solapan en parte.
 */
function profile(category: Category, n: number, score: number | ((i: number) => number), confidence = 1, offset = 0): PreferencePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    itemId: `${category}-${i + offset}`,
    category,
    score: typeof score === 'function' ? score(i) : score,
    confidence,
  }));
}
const idx = (...lists: PreferencePoint[][]) => indexPreferences(lists.flat());
/** Gustos variados de -1 a +1 (no todo +1), para que «idénticos» no sea trivial. */
const varied = (i: number) => ((i % 5) - 2) / 2;

describe(`motor de afinidad ${AFFINITY_VERSION}`, () => {
  it('sin evidencia comparable el resultado es NULL, no 0', () => {
    const a = idx(profile('movies', 10, 1));
    expect(affinity(a, idx(profile('food', 10, 1))).score).toBeNull();
    expect(affinity(a, idx()).score).toBeNull();
    // Un solo objeto en común no basta (mínimo 2).
    expect(affinity(a, idx(profile('movies', 1, 1))).score).toBeNull();
  });

  it('desacuerdo real con evidencia suficiente produce 0', () => {
    const result = affinity(idx(profile('movies', 10, 1)), idx(profile('movies', 10, -1)));
    expect(result.score).toBe(0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('gustos idénticos y abundantes producen una afinidad alta, sin estar fijada', () => {
    const result = affinity(idx(profile('movies', 20, varied)), idx(profile('movies', 20, varied)));
    expect(result.score).toBeGreaterThan(90);
    expect(result.score).toBeLessThan(100);
    expect(result.categories.movies).toMatchObject({ commonItems: 20, agreement: 1, coverage: 1 });
  });

  it('poca evidencia no produce porcentajes altos injustificados', () => {
    const two = affinity(idx(profile('movies', 2, 1)), idx(profile('movies', 2, 1))).score!;
    const five = affinity(idx(profile('movies', 5, 1)), idx(profile('movies', 5, 1))).score!;
    const twenty = affinity(idx(profile('movies', 20, 1)), idx(profile('movies', 20, 1))).score!;
    expect(two).toBeLessThan(40);
    expect(two).toBeLessThan(five);
    expect(five).toBeLessThan(twenty);
  });

  it('es direccional: la cobertura depende del historial de origen', () => {
    // A tiene 200 películas; B, 10, todas también en A y con el mismo gusto.
    const a = idx(profile('movies', 200, 1));
    const b = idx(profile('movies', 10, 1));
    const aToB = affinity(a, b);
    const bToA = affinity(b, a);
    expect(aToB.categories.movies.coverage).toBe(0.05);
    expect(bToA.categories.movies.coverage).toBe(1);
    expect(aToB.score).not.toBe(bToA.score);
    expect(bToA.score!).toBeGreaterThan(aToB.score!);
    // Cobertura suavizada: un historial enorme no hunde la afinidad a casi 0.
    expect(aToB.score!).toBeGreaterThan(60);
  });

  it('las categorías sin comparación no cuentan como 0 en la global', () => {
    const movies = profile('movies', 12, varied);
    const onlyMovies = affinity(idx(movies), idx(movies));
    // A también tiene restaurantes, pero B no: la global no baja.
    const withFood = affinity(idx(movies, profile('food', 15, 1)), idx(movies));
    expect(withFood.categories.food.score).toBeNull();
    expect(withFood.score).toBe(onlyMovies.categories.movies.score);
    expect(onlyMovies.score).toBe(onlyMovies.categories.movies.score);
  });

  it('la global pondera por la profundidad del historial de origen y gana confianza con más categorías', () => {
    const a = idx(profile('movies', 30, 1), profile('games', 3, 1));
    const b = idx(profile('movies', 30, 1), profile('games', 3, -1));
    const result = affinity(a, b);
    expect(result.categoriesCompared).toBe(2);
    expect(result.categories.games.score).toBe(0);
    // Películas (30 objetos) pesa más que juegos (3): la global queda más cerca de películas que de 0.
    expect(result.score!).toBeGreaterThan(result.categories.movies.score! / 2);
    const single = affinity(idx(profile('movies', 30, 1)), idx(profile('movies', 30, 1)));
    expect(result.confidence).toBeGreaterThan(single.confidence);
  });

  it('la evidencia repartida entre categorías se suma (affinity-v2): 11 coincidencias en 4 categorías superan a 4 en una', () => {
    const spread = idx(profile('movies', 4, 1), profile('books', 2, 1), profile('culture', 2, 1), profile('food', 3, 1));
    const onlyMovies = idx(profile('movies', 4, 1));
    const broad = affinity(spread, spread);
    const narrow = affinity(onlyMovies, onlyMovies);
    expect(broad.categoriesCompared).toBe(4);
    expect(broad.score!).toBeGreaterThan(narrow.score!);
    // Cada categoría por separado tiene poca evidencia: la global es mayor que cualquiera de ellas.
    for (const c of ['movies', 'books', 'culture', 'food'] as const) expect(broad.score!).toBeGreaterThan(broad.categories[c].score!);
    // Pero con poca evidencia total sigue sin acercarse a 100.
    expect(broad.score!).toBeLessThan(95);
  });

  it('la confianza de los datos importa: la conducta (0,6) pesa menos que la valoración explícita (1)', () => {
    const explicit = affinity(idx(profile('games', 12, 0.8, 1)), idx(profile('games', 12, 0.8, 1))).score!;
    const behavior = affinity(idx(profile('games', 12, 0.8, 0.6)), idx(profile('games', 12, 0.8, 0.6))).score!;
    expect(behavior).toBeLessThan(explicit);
    // Calibración documentada: con el suelo 0,75 no queda limitada a ~50 como con la fórmula literal de §11.
    const literal = affinity(idx(profile('games', 12, 0.8, 0.6)), idx(profile('games', 12, 0.8, 0.6)), { ...AFFINITY_PARAMS_V1, dataConfidenceFloor: 0 }).score!;
    expect(literal).toBeLessThan(55);
    expect(behavior).toBeGreaterThan(70);
  });

  it('el peso de cada objeto en común es la confianza menor de las dos', () => {
    const strong = profile('music', 6, 1, 1);
    const weak = profile('music', 6, 1, 0.3);
    const result = categoryAffinity('music', idx(strong).get('music'), idx(weak).get('music'));
    expect(result.effectiveEvidence).toBeCloseTo(1.8, 6);
  });

  it('acuerdo parcial: 1 frente a 0,5 da 0,75 de acuerdo por objeto', () => {
    const result = categoryAffinity('food', idx(profile('food', 8, 1)).get('food'), idx(profile('food', 8, 0.5)).get('food'));
    expect(result.agreement).toBe(0.75);
  });

  it('es determinista', () => {
    const a = idx(profile('series', 9, varied), profile('books', 4, 1));
    const b = idx(profile('series', 9, (i) => -varied(i)), profile('books', 4, 0.5));
    expect(affinity(a, b)).toEqual(affinity(a, b));
  });

  it('afinidad mutua excepcional solo si ambas direcciones llegan a 90', () => {
    expect(isExceptionalMutual(95, 91)).toBe(true);
    expect(isExceptionalMutual(95, 89.99)).toBe(false);
    expect(isExceptionalMutual(95, null)).toBe(false);
  });
});
