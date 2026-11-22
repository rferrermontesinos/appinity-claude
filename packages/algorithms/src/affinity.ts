import { CATEGORIES, type Category } from '@appinity/shared';

/**
 * Motor de afinidad (§11): determinista, explicable y versionado. Sin IA generativa.
 *
 * Compara solo PREFERENCIAS consolidadas de objetos que conocen AMBAS personas (gustos y disgustos). Lo que solo conoce
 * una de las dos no cuenta en ningún sentido: si Laura puntuó mal un restaurante que Sam no conoce, la afinidad no
 * cambia (decisión del usuario, 2026-10-13). Conocido o consumido sin preferencia tampoco cuenta. Por categoría:
 *
 *   C = objetos con preferencia en A y en B
 *   w_i = min(confA_i, confB_i)          n_eff = Σ w_i
 *   r_i = rarityWeight(personas con preferencia sobre i, personas comparables)   (`affinity-v5`; 1 sin datos)
 *   agreement_i = 1 − |scoreA − scoreB| / 2
 *   agreement = Σ w_i · r_i · agreement_i / Σ w_i · r_i
 *
 * La rareza solo reparte el peso DENTRO del acuerdo: coincidir (o discrepar) en algo poco común cuenta más que en algo
 * que conoce todo el mundo. La evidencia (n_eff) y la confianza no cambian: la rareza nunca crea cifras altas con
 * pocas obras en común.
 *   evidenceFactor = 1 − exp(−n_eff / tau_categoría)
 *   dataConfidence = media(w_i)          dataConfidenceFactor = floor + (1 − floor) · dataConfidence
 *   afinidad = 100 · agreement · evidenceFactor · dataConfidenceFactor
 *
 * Global: media ponderada de la calidad del acuerdo de las categorías comparables (una categoría sin objetos en común
 * no cuenta), multiplicada por un factor de evidencia que suma la de todas:
 *
 *   calidad_c = agreement · dataConfidenceFactor        peso_c = log1p(n_eff_c)
 *   global = 100 · (Σ peso_c · calidad_c / Σ peso_c) · (1 − exp(−Σ_c n_eff_c / tau_c))
 *
 * Cifra por categoría dentro de la global (encogimiento parcial, `affinity-v4`): con poca evidencia en una categoría,
 * su cifra se acerca a la calidad global de la pareja (Q) en vez de a 0; con mucha, manda su propio acuerdo:
 *
 *   w_c = 1 − exp(−n_eff_c / tau_c)      categoría_c = 100 · E · (w_c · calidad_c + (1 − w_c) · Q)
 *
 * Así la global queda siempre entre la menor y la mayor de las categorías, y sigue sin haber cifras altas con poca
 * evidencia (E limita todas). Con una sola categoría comparable coincide con la fórmula por categoría.
 *
 * Historia (docs/decisions.md):
 * - `affinity-v1`: §11 con suelo 0,75 en la confianza de datos (la literal limitaba al ~50 % los gustos idénticos
 *   inferidos de conducta).
 * - `affinity-v2`: la evidencia de varias categorías se suma (antes, coincidir en 4 categorías puntuaba menos que en 1).
 * - `affinity-v3`: sin el factor de cobertura de §11 y con pesos por evidencia común. La afinidad pasa a ser SIMÉTRICA
 *   (A → B = B → A): la «direccionalidad» de §4 venía solo de penalizar lo que el otro no conoce.
 * - `affinity-v4`: encogimiento parcial de cada categoría hacia la calidad global (antes, una pareja podía tener 86 de
 *   global y ninguna categoría por encima de 50, porque cada categoría se penalizaba solo con su propia evidencia).
 * - `affinity-v5` (2026-10-27): el acuerdo de cada obra pesa por su rareza en el dataset (`rarityWeight`). Con muy poca
 *   gente todo pesa casi igual; la calibración con datos reales queda para la beta (docs/decisions.md).
 */
export const AFFINITY_VERSION = 'affinity-v5';

/** Peso por rareza de cada obra (itemId → r_i ≥ 1). Sin entrada, la obra pesa 1. */
export type RarityWeights = ReadonlyMap<string, number>;

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
  /** agreement · dataConfidenceFactor (sin el factor de evidencia): lo que promedia la global. */
  quality: number | null;
  /** Evidencia efectiva en unidades de tau de la categoría (lo que suma la evidencia global). */
  evidenceUnits: number;
  /** Media de los pesos w_i (confianza de los datos comparados). */
  dataConfidence: number | null;
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
  rarity?: RarityWeights,
): CategoryAffinity {
  const sourceItems = source?.size ?? 0;
  let common = 0;
  let nEff = 0;
  let weighted = 0;
  let agreementWeight = 0;
  if (source && target) {
    const [small, large] = source.size <= target.size ? [source, target] : [target, source];
    for (const [itemId, a] of small) {
      const b = large.get(itemId);
      if (!b) continue;
      const fromSource = small === source ? a : b;
      const fromTarget = small === source ? b : a;
      const w = Math.min(fromSource.confidence, fromTarget.confidence);
      const r = rarity?.get(itemId) ?? 1;
      common++;
      nEff += w;
      agreementWeight += w * r;
      weighted += w * r * (1 - Math.abs(fromSource.score - fromTarget.score) / 2);
    }
  }
  const coverage = sourceItems ? common / sourceItems : 0;
  const base = { category, commonItems: common, effectiveEvidence: round(nEff), coverage: round(coverage), sourceItems };
  if (common < params.minCommon || nEff < params.minEffective) {
    return { ...base, score: null, confidence: 0, agreement: null, quality: null, evidenceUnits: 0, dataConfidence: null };
  }
  const agreement = weighted / agreementWeight;
  const evidenceFactor = 1 - Math.exp(-nEff / params.tau[category]);
  const dataConfidence = nEff / common;
  const dataFactor = params.dataConfidenceFloor + (1 - params.dataConfidenceFloor) * dataConfidence;
  return {
    ...base,
    score: round(100 * agreement * evidenceFactor * dataFactor, 2),
    confidence: round(evidenceFactor * dataConfidence),
    agreement: round(agreement),
    quality: agreement * dataFactor,
    evidenceUnits: nEff / params.tau[category],
    dataConfidence,
  };
}

/** Afinidad global A → B: media ponderada de las categorías con resultado. */
export function affinity(
  source: PreferenceIndex,
  target: PreferenceIndex,
  params: AffinityParams = AFFINITY_PARAMS_V1,
  rarity?: RarityWeights,
): GlobalAffinity {
  const categories = {} as Record<Category, CategoryAffinity>;
  let weightSum = 0;
  let qualitySum = 0;
  let dataSum = 0;
  let units = 0;
  let compared = 0;
  let commonItems = 0;
  for (const category of CATEGORIES) {
    const sourceCat = source.get(category);
    const result = categoryAffinity(category, sourceCat, target.get(category), params, rarity);
    categories[category] = result;
    commonItems += result.commonItems;
    if (result.score === null || result.quality === null || result.dataConfidence === null) continue;
    // Peso por la evidencia en común: lo que solo conoce una persona no influye.
    const weight = Math.log1p(result.effectiveEvidence);
    weightSum += weight;
    qualitySum += weight * result.quality;
    dataSum += weight * result.dataConfidence;
    units += result.evidenceUnits;
    compared++;
  }
  if (!compared || weightSum <= 0) return { score: null, confidence: 0, categoriesCompared: 0, commonItems, categories };
  // La evidencia de varias categorías se suma: más categorías comparables, más evidencia y más confianza.
  const evidence = 1 - Math.exp(-units);
  const globalQuality = qualitySum / weightSum;
  for (const category of CATEGORIES) {
    const c = categories[category];
    if (c.score === null || c.quality === null) continue;
    const own = 1 - Math.exp(-c.effectiveEvidence / params.tau[category]);
    categories[category] = { ...c, score: round(100 * evidence * (own * c.quality + (1 - own) * globalQuality), 2) };
  }
  return {
    score: round(100 * (qualitySum / weightSum) * evidence, 2),
    confidence: round(evidence * (dataSum / weightSum)),
    categoriesCompared: compared,
    commonItems,
    categories,
  };
}

/**
 * Peso por rareza de una obra: 1 + ln((N + 1) / (n + 1)), con N las personas comparables del dataset y n las que tienen
 * preferencia sobre la obra. Lo que conoce casi todo el mundo pesa ~1; lo que conocen pocas, más (con 1.000 personas,
 * una obra de 2 pesa ~6,8 y una de 500, ~1,7). Nunca baja de 1, y con muy poca gente todo pesa casi igual.
 */
export function rarityWeight(holders: number, population: number): number {
  return Math.max(1, 1 + Math.log((Math.max(population, 0) + 1) / (Math.max(holders, 0) + 1)));
}

/** «Afinidad mutua excepcional» (§4): ambas direcciones ≥ 90. */
export function isExceptionalMutual(aToB: number | null, bToA: number | null): boolean {
  return aToB !== null && bToA !== null && aToB >= 90 && bToA >= 90;
}
