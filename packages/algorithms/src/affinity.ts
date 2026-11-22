import { CATEGORIES, type Category } from '@appinity/shared';

/**
 * Motor de afinidad (§11): determinista, explicable, direccional y versionado. Sin IA generativa.
 *
 * Compara solo PREFERENCIAS consolidadas del mismo objeto (gustos y disgustos). Conocido o consumido sin preferencia no
 * mide acuerdo de gustos. Para A → B, por categoría:
 *
 *   C = objetos con preferencia en A y en B
 *   w_i = min(confA_i, confB_i)          n_eff = Σ w_i
 *   agreement_i = 1 − |scoreA − scoreB| / 2
 *   agreement = Σ w_i · agreement_i / Σ w_i
 *   evidenceFactor = 1 − exp(−n_eff / tau_categoría)
 *   coverage(A → B) = |C| / N_A           coverageFactor = 0,80 + 0,20 · √coverage
 *   dataConfidence = media(w_i)          dataConfidenceFactor = floor + (1 − floor) · dataConfidence
 *   afinidad = 100 · agreement · evidenceFactor · coverageFactor · dataConfidenceFactor
 *
 * Con `dataConfidenceFloor = 0` es exactamente la propuesta V1 de §11. `affinity-v1` usa 0,75: la confianza ya reduce
 * n_eff (y con ella evidenceFactor), y multiplicarla otra vez entera limitaba al 57 % a dos personas con gustos
 * idénticos inferidos de conducta (horas, escuchas: confianza 0,6). Calibración en docs/decisions.md.
 *
 * Sin objetos comparables suficientes el resultado es NULL; con evidencia suficiente y desacuerdo total, 0. La global
 * es la media ponderada de las categorías no NULL (una categoría ausente no cuenta como 0), con peso
 * log1p(Σ confianzas de las preferencias de A en la categoría): profundidad del historial de origen sin que miles de
 * escuchas de un mismo objeto pesen más que una preferencia (cada objeto cuenta una vez).
 */
export const AFFINITY_VERSION = 'affinity-v1';

export interface AffinityParams {
  /** Evidencia efectiva con la que evidenceFactor llega al 63 % (1 − 1/e). Depende del tamaño típico de la categoría. */
  tau: Record<Category, number>;
  /** Mínimo de objetos comparables para dar un resultado (si no, NULL). */
  minCommon: number;
  /** Mínimo de evidencia efectiva (Σ w_i). */
  minEffective: number;
  /** Suelo del factor de confianza de los datos (0 = propuesta V1 literal de §11). */
  dataConfidenceFloor: number;
}

export const AFFINITY_PARAMS_V1: AffinityParams = {
  tau: { food: 4, culture: 3, movies: 6, series: 4, music: 5, games: 4, books: 4, podcasts: 2 },
  minCommon: 2,
  minEffective: 1,
  dataConfidenceFloor: 0.75,
};

/** Preferencia consolidada de un usuario sobre un objeto (user_item_profiles con preferencia no NULL). */
export interface PreferencePoint {
  itemId: string;
  category: Category;
  score: number;
  confidence: number;
}

export interface CategoryAffinity {
  category: Category;
  /** 0–100, o NULL si no hay evidencia comparable suficiente. */
  score: number | null;
  /** Confianza de la cifra (0–1): evidenceFactor × confianza media de los datos. */
  confidence: number;
  commonItems: number;
  effectiveEvidence: number;
  agreement: number | null;
  coverage: number;
  /** Preferencias del usuario de origen en la categoría (denominador de la cobertura). */
  sourceItems: number;
}

export interface GlobalAffinity {
  score: number | null;
  confidence: number;
  categoriesCompared: number;
  commonItems: number;
  categories: Record<Category, CategoryAffinity>;
}

const round = (v: number, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Índice de preferencias de un usuario por categoría y objeto. */
export type PreferenceIndex = Map<Category, Map<string, PreferencePoint>>;

export function indexPreferences(points: readonly PreferencePoint[]): PreferenceIndex {
  const index: PreferenceIndex = new Map();
  for (const p of points) {
    if (!Number.isFinite(p.score) || !(p.confidence > 0)) continue;
    let byItem = index.get(p.category);
    if (!byItem) index.set(p.category, (byItem = new Map()));
    byItem.set(p.itemId, p);
  }
  return index;
}

/** Afinidad A → B en una categoría. */
export function categoryAffinity(
  category: Category,
  source: ReadonlyMap<string, PreferencePoint> | undefined,
  target: ReadonlyMap<string, PreferencePoint> | undefined,
  params: AffinityParams = AFFINITY_PARAMS_V1,
): CategoryAffinity {
  const sourceItems = source?.size ?? 0;
  let common = 0;
  let nEff = 0;
  let weighted = 0;
  if (source && target) {
    const [small, large] = source.size <= target.size ? [source, target] : [target, source];
    for (const [itemId, a] of small) {
      const b = large.get(itemId);
      if (!b) continue;
      const fromSource = small === source ? a : b;
      const fromTarget = small === source ? b : a;
      const w = Math.min(fromSource.confidence, fromTarget.confidence);
      common++;
      nEff += w;
      weighted += w * (1 - Math.abs(fromSource.score - fromTarget.score) / 2);
    }
  }
  const coverage = sourceItems ? common / sourceItems : 0;
  const base = { category, commonItems: common, effectiveEvidence: round(nEff), coverage: round(coverage), sourceItems };
  if (common < params.minCommon || nEff < params.minEffective) {
    return { ...base, score: null, confidence: 0, agreement: null };
  }
  const agreement = weighted / nEff;
  const evidenceFactor = 1 - Math.exp(-nEff / params.tau[category]);
  const coverageFactor = 0.8 + 0.2 * Math.sqrt(coverage);
  const dataConfidence = nEff / common;
  const dataFactor = params.dataConfidenceFloor + (1 - params.dataConfidenceFloor) * dataConfidence;
  return {
    ...base,
    score: round(100 * agreement * evidenceFactor * coverageFactor * dataFactor, 2),
    confidence: round(evidenceFactor * dataConfidence),
    agreement: round(agreement),
  };
}

/** Afinidad global A → B: media ponderada de las categorías con resultado. */
export function affinity(source: PreferenceIndex, target: PreferenceIndex, params: AffinityParams = AFFINITY_PARAMS_V1): GlobalAffinity {
  const categories = {} as Record<Category, CategoryAffinity>;
  let weightSum = 0;
  let scoreSum = 0;
  let notConfident = 1;
  let compared = 0;
  let commonItems = 0;
  for (const category of CATEGORIES) {
    const sourceCat = source.get(category);
    const result = categoryAffinity(category, sourceCat, target.get(category), params);
    categories[category] = result;
    commonItems += result.commonItems;
    if (result.score === null) continue;
    let depth = 0;
    for (const p of sourceCat?.values() ?? []) depth += p.confidence;
    const weight = Math.log1p(depth);
    weightSum += weight;
    scoreSum += weight * result.score;
    notConfident *= 1 - result.confidence;
    compared++;
  }
  return {
    score: compared && weightSum > 0 ? round(scoreSum / weightSum, 2) : null,
    // Varias categorías comparables aumentan la confianza global.
    confidence: compared ? round(1 - notConfident) : 0,
    categoriesCompared: compared,
    commonItems,
    categories,
  };
}

/** «Afinidad mutua excepcional» (§4): ambas direcciones ≥ 90. */
export function isExceptionalMutual(aToB: number | null, bToA: number | null): boolean {
  return aToB !== null && bToA !== null && aToB >= 90 && bToA >= 90;
}
