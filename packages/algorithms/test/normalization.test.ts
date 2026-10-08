import { describe, expect, it } from 'vitest';
import {
  RATING_SCALES,
  frequencyPreference,
  normalizeRating,
  normalizeRating1to10,
  percentile,
  playtimePreference,
} from '../src/normalization.js';

describe('normalización de valoraciones', () => {
  it('1–10 sigue la fórmula de la especificación (rating - 5.5) / 4.5', () => {
    for (const r of [1, 2, 5, 6, 9, 10]) expect(normalizeRating1to10(r)).toBeCloseTo((r - 5.5) / 4.5, 4);
    expect(normalizeRating1to10(10)).toBe(1);
    expect(normalizeRating1to10(1)).toBe(-1);
  });

  it('cinco estrellas de 1–5 equivalen a +1 y tres estrellas a neutral (0)', () => {
    expect(normalizeRating(5, RATING_SCALES.oneToFiveStars)).toBe(1);
    expect(normalizeRating(3, RATING_SCALES.oneToFiveStars)).toBe(0);
    expect(normalizeRating(1, RATING_SCALES.oneToFiveStars)).toBe(-1);
  });

  it('respeta escalas con medias estrellas en lugar de aplicar la de 1–10', () => {
    expect(normalizeRating(0.5, RATING_SCALES.halfToFiveStars)).toBe(-1);
    expect(normalizeRating(5, RATING_SCALES.halfToFiveStars)).toBe(1);
    expect(normalizeRating(3, RATING_SCALES.halfToFiveStars)).toBeCloseTo(0.1111, 4);
    expect(() => normalizeRating(0, RATING_SCALES.halfToFiveStars)).toThrow(RangeError);
    expect(() => normalizeRating(4.3, RATING_SCALES.halfToFiveStars)).toThrow(/paso/);
  });

  it('rechaza valores fuera de escala o no finitos', () => {
    expect(() => normalizeRating(11, RATING_SCALES.oneToTen)).toThrow(RangeError);
    expect(() => normalizeRating(Number.NaN, RATING_SCALES.oneToTen)).toThrow(RangeError);
  });
});

describe('señales conductuales', () => {
  it('percentil por interpolación lineal', () => {
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([10], 0.95)).toBe(10);
    expect(percentile([0, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBeCloseTo(9.55, 5);
  });

  it('una escucha aislada no genera preferencia', () => {
    expect(frequencyPreference(1, 200, 3)).toBeNull();
    expect(frequencyPreference(2, 200, 3)).toBeNull();
    expect(frequencyPreference(3, 200, 3)).toBeGreaterThan(0);
  });

  it('la frecuencia se calibra dentro de cada usuario', () => {
    // 100 escuchas pesan más para quien escucha poco que para quien escucha mucho.
    const lightListener = frequencyPreference(100, 120, 3)!;
    const heavyListener = frequencyPreference(100, 5000, 3)!;
    expect(lightListener).toBeGreaterThan(heavyListener);
    expect(frequencyPreference(10_000, 120, 3)).toBe(1);
  });

  it('horas jugadas: sin preferencia por debajo del mínimo y protección si el percentil es 0', () => {
    expect(playtimePreference(0, 50, 2)).toBeNull();
    expect(playtimePreference(1.5, 50, 2)).toBeNull();
    expect(playtimePreference(10, 0, 2)).toBe(1);
    expect(playtimePreference(10, null, 2)).toBe(1);
    const p = playtimePreference(10, 100, 2)!;
    expect(p).toBeCloseTo(Math.log1p(10) / Math.log1p(100), 4);
    expect(p).toBeGreaterThan(0);
  });
});
