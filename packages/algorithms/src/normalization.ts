/**
 * Normalización de escalas y señales conductuales a preferencias en [-1, 1].
 * Funciones puras y deterministas: sin dependencias de proveedores (§8).
 */

export interface RatingScale {
  /** Valor mínimo que la fuente admite realmente. */
  min: number;
  /** Valor máximo que la fuente admite realmente. */
  max: number;
  /** Paso de la escala (p. ej. 0.5 para medias estrellas). Solo se usa para validar. */
  step: number;
}

/** Escalas documentadas. Si una fuente admite 0 o 0,5, se usa su escala real, no la de 1–10. */
export const RATING_SCALES = {
  oneToTen: { min: 1, max: 10, step: 1 },
  oneToFiveStars: { min: 1, max: 5, step: 1 },
  halfToFiveStars: { min: 0.5, max: 5, step: 0.5 },
} as const satisfies Record<string, RatingScale>;

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * Normalización lineal de una escala [min, max] a [-1, 1]: el mínimo es -1, el máximo +1 y el punto medio 0
 * (neutralidad). Para 1–10 coincide con la fórmula de la especificación, (rating - 5.5) / 4.5.
 */
export function normalizeRating(value: number, scale: RatingScale): number {
  if (!Number.isFinite(value)) throw new RangeError('La valoración debe ser un número finito');
  if (value < scale.min || value > scale.max) {
    throw new RangeError(`Valoración ${value} fuera de la escala [${scale.min}, ${scale.max}]`);
  }
  const steps = (value - scale.min) / scale.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) {
    throw new RangeError(`Valoración ${value} no respeta el paso ${scale.step} de la escala`);
  }
  return round4((2 * (value - scale.min)) / (scale.max - scale.min) - 1);
}

/** Fórmula literal de la especificación para 1–10 (se mantiene para documentarla y testearla). */
export function normalizeRating1to10(rating: number): number {
  return normalizeRating(rating, RATING_SCALES.oneToTen);
}

/**
 * Percentil por interpolación lineal (p en [0, 1]). Devuelve null sin datos.
 * Se usa para calibrar señales dentro de cada usuario (p. ej. horas jugadas o escuchas).
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (p < 0 || p > 1) throw new RangeError('p debe estar en [0, 1]');
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sorted[lower]!;
  const upperValue = sorted[upper]!;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

/**
 * Preferencia inferida por frecuencia (escuchas, episodios…), calibrada con el percentil 95 del propio
 * usuario: min(1, log1p(n) / log1p(p95)). Por debajo de `minCount` no hay preferencia (NULL): una escucha
 * aislada confirma consumo, pero no gusto. Propuesta sin calibrar.
 */
export function frequencyPreference(count: number, userP95: number | null, minCount: number): number | null {
  if (!Number.isFinite(count) || count < minCount) return null;
  const reference = Math.max(userP95 ?? 0, minCount);
  return round4(Math.min(1, Math.log1p(count) / Math.log1p(reference)));
}

/**
 * Preferencia inferida por horas de juego (§9): min(1, log1p(h) / log1p(p95 del usuario)), con protección si
 * el percentil es 0 o falta. Por debajo de `minHours` no se infiere preferencia. Nunca es negativa: pocas
 * horas no prueban rechazo. Propuesta sin calibrar.
 */
export function playtimePreference(hours: number, userP95Hours: number | null, minHours: number): number | null {
  if (!Number.isFinite(hours) || hours < minHours) return null;
  const reference = Math.max(userP95Hours ?? 0, minHours);
  return round4(Math.min(1, Math.log1p(hours) / Math.log1p(reference)));
}
