import type { Category } from '@appinity/shared';

/**
 * Recomendador (§12 y §13): determinista y versionado. Tres fuentes de candidatos y una mezcla objetivo 70/20/10 que
 * solo se cumple cuando hay candidatos: nunca se inventan apoyos para completar una cuota.
 *
 * - Consenso (70 %): solo el Top 50 de almas gemelas y una persona = un voto (sus fuentes ya están consolidadas por
 *   objeto). consensus = (apoyos / opiniones) · (1 − e^(−apoyos/3)) · preferencia media de los apoyos · confianza media.
 * - Descubrimiento (20 %): gustos fuertes (≥ 0,8, confianza ≥ 0,7) de UNA persona muy afín (≥ 50). Se registra quién
 *   lo aporta. Puntuación = afinidad (de la categoría si existe) / 100 · preferencia · confianza.
 * - Trending (10 %): votos explícitos de personas de la zona, sin peso por afinidad. Media bayesiana con los votos altos
 *   y los bajos (prior 0, peso 3), mínimo de votantes únicos y proporción de votos altos.
 */
export const RECOMMENDATION_VERSION = 'recommendation-v1';

export interface RecommendationParams {
  /** Conocido a partir de este knownConfidence: no se recomienda en Home (§5). */
  knownThreshold: number;
  consensus: { positiveScore: number; positiveConfidence: number; minSupporters: number };
  discovery: { minAffinity: number; minScore: number; minConfidence: number };
  trending: { voteScore: number; voteConfidence: number; minVoters: number; priorWeight: number; priorMean: number; minAverage: number };
  /** Tarjetas de cada bloque en cada tanda de 10. */
  mix: { consensus: number; discovery: number; trending: number };
}

export const RECOMMENDATION_PARAMS_V1: RecommendationParams = {
  knownThreshold: 0.8,
  consensus: { positiveScore: 0.5, positiveConfidence: 0.5, minSupporters: 2 },
  discovery: { minAffinity: 50, minScore: 0.8, minConfidence: 0.7 },
  trending: { voteScore: 0.6, voteConfidence: 0.8, minVoters: 5, priorWeight: 3, priorMean: 0, minAverage: 0.3 },
  mix: { consensus: 7, discovery: 2, trending: 1 },
};

export type RecommendationBlock = 'consensus' | 'discovery' | 'trending';

export interface Opinion {
  userId: string;
  score: number;
  confidence: number;
}

export interface ConsensusCandidate {
  itemId: string;
  score: number;
  supporters: number;
  /** Almas gemelas con opinión (positiva o negativa) sobre el objeto: el denominador. */
  opinionated: number;
  averagePositive: number;
  evidenceConfidence: number;
}

const round = (v: number, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** Consenso del Top 50. `opinionsByItem` solo debe contener opiniones de las almas gemelas del Top 50. */
export function consensusCandidates(
  opinionsByItem: ReadonlyMap<string, readonly Opinion[]>,
  params: RecommendationParams = RECOMMENDATION_PARAMS_V1,
): ConsensusCandidate[] {
  const out: ConsensusCandidate[] = [];
  for (const [itemId, all] of opinionsByItem) {
    // Una persona, un voto (por si llegara duplicada).
    const opinions = [...new Map(all.map((o) => [o.userId, o])).values()];
    const supporters = opinions.filter((o) => o.score >= params.consensus.positiveScore && o.confidence >= params.consensus.positiveConfidence);
    if (supporters.length < params.consensus.minSupporters) continue;
    const averagePositive = mean(supporters.map((o) => o.score));
    const evidenceConfidence = mean(supporters.map((o) => o.confidence));
    const share = supporters.length / opinions.length;
    out.push({
      itemId,
      score: round(share * (1 - Math.exp(-supporters.length / 3)) * averagePositive * evidenceConfidence),
      supporters: supporters.length,
      opinionated: opinions.length,
      averagePositive: round(averagePositive),
      evidenceConfidence: round(evidenceConfidence),
    });
  }
  return out.sort((a, b) => b.score - a.score || b.supporters - a.supporters || a.itemId.localeCompare(b.itemId));
}

export interface DiscoveryPerson {
  userId: string;
  /** Afinidad global 0–100. */
  affinity: number;
  /** Afinidad por categoría (si existe, prevalece sobre la global para objetos de esa categoría). */
  categoryAffinity: Partial<Record<Category, number>>;
  preferences: ReadonlyArray<{ itemId: string; category: Category; score: number; confidence: number }>;
}

export interface DiscoveryCandidate {
  itemId: string;
  score: number;
  contributorId: string;
  contributorAffinity: number;
}

/** Descubrimiento: cada objeto, atribuido a la persona que más lo respalda. */
export function discoveryCandidates(people: readonly DiscoveryPerson[], params: RecommendationParams = RECOMMENDATION_PARAMS_V1): DiscoveryCandidate[] {
  const best = new Map<string, DiscoveryCandidate>();
  for (const person of people) {
    for (const p of person.preferences) {
      const affinity = person.categoryAffinity[p.category] ?? person.affinity;
      if (affinity < params.discovery.minAffinity || p.score < params.discovery.minScore || p.confidence < params.discovery.minConfidence) continue;
      const score = round((affinity / 100) * p.score * p.confidence);
      const current = best.get(p.itemId);
      if (!current || score > current.score || (score === current.score && person.userId < current.contributorId)) {
        best.set(p.itemId, { itemId: p.itemId, score, contributorId: person.userId, contributorAffinity: affinity });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
}

export interface TrendingCandidate {
  itemId: string;
  score: number;
  averageScore: number;
  positiveVoters: number;
  totalVoters: number;
}

/** Trending: votos (una persona, un voto) ya filtrados por zona, año y reglas de fecha del objeto. */
export function trendingCandidates(
  votesByItem: ReadonlyMap<string, readonly Opinion[]>,
  params: RecommendationParams = RECOMMENDATION_PARAMS_V1,
): TrendingCandidate[] {
  const t = params.trending;
  const out: TrendingCandidate[] = [];
  for (const [itemId, all] of votesByItem) {
    const votes = [...new Map(all.map((v) => [v.userId, v])).values()];
    if (votes.length < t.minVoters) continue;
    const sum = votes.reduce((a, v) => a + v.score, 0);
    const bayes = (t.priorWeight * t.priorMean + sum) / (t.priorWeight + votes.length);
    const positiveVoters = votes.filter((v) => v.score >= t.voteScore && v.confidence >= t.voteConfidence).length;
    if (bayes < t.minAverage || positiveVoters * 2 < votes.length) continue;
    out.push({ itemId, score: round(bayes), averageScore: round(sum / votes.length), positiveVoters, totalVoters: votes.length });
  }
  return out.sort((a, b) => b.score - a.score || b.positiveVoters - a.positiveVoters || a.itemId.localeCompare(b.itemId));
}

export interface MixedRecommendation<T extends { itemId: string }> {
  block: RecommendationBlock;
  /** Ocupa el hueco de otro bloque sin candidatos (el motivo sigue siendo el de su propio bloque). */
  fillsFor: RecommendationBlock | null;
  candidate: T;
}

/**
 * Mezcla por tandas de 10 (7/2/1). Si un bloque se queda sin candidatos, su hueco lo ocupa otro bloque, en el orden
 * consenso → descubrimiento → trending, marcado con `fillsFor`. Sin duplicados.
 */
export function mixRecommendations<C extends { itemId: string }, D extends { itemId: string }, T extends { itemId: string }>(
  lists: { consensus: readonly C[]; discovery: readonly D[]; trending: readonly T[] },
  limit: number,
  params: RecommendationParams = RECOMMENDATION_PARAMS_V1,
): Array<MixedRecommendation<C | D | T>> {
  const order: RecommendationBlock[] = ['consensus', 'discovery', 'trending'];
  const queues = { consensus: [...lists.consensus], discovery: [...lists.discovery], trending: [...lists.trending] } as Record<RecommendationBlock, Array<C | D | T>>;
  const used = new Set<string>();
  const next = (block: RecommendationBlock): (C | D | T) | undefined => {
    const queue = queues[block];
    while (queue.length) {
      const candidate = queue.shift()!;
      if (!used.has(candidate.itemId)) return candidate;
    }
    return undefined;
  };
  const out: Array<MixedRecommendation<C | D | T>> = [];
  while (out.length < limit && order.some((b) => queues[b].some((c) => !used.has(c.itemId)))) {
    for (const block of order) {
      for (let slot = 0; slot < params.mix[block] && out.length < limit; slot++) {
        let candidate = next(block);
        let source: RecommendationBlock = block;
        if (!candidate) {
          for (const other of order) {
            if (other === block) continue;
            candidate = next(other);
            if (candidate) {
              source = other;
              break;
            }
          }
        }
        if (!candidate) break;
        used.add(candidate.itemId);
        out.push({ block: source, fillsFor: source === block ? null : block, candidate });
      }
    }
  }
  return out;
}

/** Año actual en la zona horaria del usuario (nunca fijo). */
export function currentYear(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(now));
}

/** Categorías con regla de estreno: el objeto debe haberse estrenado o publicado este año para ser Trending. */
export const DATED_CATEGORIES: readonly Category[] = ['movies', 'series', 'books', 'games'];

/**
 * Por contenido (arranque en frío, 2026-10-22): obras relacionadas (misma saga, director, autor, estudio,
 * influencias…) con lo que al usuario le GUSTA, aunque todavía no tenga almas gemelas. Respaldo que va antes de la
 * comunidad; cada tarjeta dice «porque te gusta X». Solo cuentan gustos claros (puntuación ≥ `minLikeScore`): conocer o
 * haber consumido algo no basta, y un disgusto nunca recomienda lo relacionado.
 */
export interface ContentLike {
  itemId: string;
  score: number;
  confidence: number;
}

export interface ContentRelation {
  sourceItemId: string;
  targetItemId: string;
  relation: string;
  weight: number;
}

export interface ContentCandidate {
  itemId: string;
  score: number;
  becauseItemId: string;
  relation: string;
  /** Cuántos gustos distintos llevan a este objeto. */
  sources: number;
}

export interface ContentParams {
  minLikeScore: number;
  /** Como mucho N recomendaciones por cada gusto de origen, para no llenar el mazo con una sola saga. */
  maxPerSource: number;
}

export const CONTENT_PARAMS_V1: ContentParams = { minLikeScore: 0.3, maxPerSource: 3 };

export function contentCandidates(
  likes: readonly ContentLike[],
  relations: readonly ContentRelation[],
  params: ContentParams = CONTENT_PARAMS_V1,
): ContentCandidate[] {
  const liked = new Map(likes.filter((l) => l.score >= params.minLikeScore && l.confidence > 0).map((l) => [l.itemId, l]));
  const byTarget = new Map<string, { score: number; best: number; becauseItemId: string; relation: string; sources: Set<string> }>();
  for (const r of relations) {
    const like = liked.get(r.sourceItemId);
    if (!like || liked.has(r.targetItemId) || r.weight <= 0) continue;
    const contribution = like.score * like.confidence * Math.min(1, r.weight);
    const current = byTarget.get(r.targetItemId);
    if (!current) {
      byTarget.set(r.targetItemId, { score: contribution, best: contribution, becauseItemId: r.sourceItemId, relation: r.relation, sources: new Set([r.sourceItemId]) });
      continue;
    }
    // Varias relaciones desde el mismo gusto no se suman (misma saga y mismo director no cuentan doble).
    if (!current.sources.has(r.sourceItemId)) current.score += contribution;
    else if (contribution > current.best) current.score += contribution - current.best;
    current.sources.add(r.sourceItemId);
    if (contribution > current.best) Object.assign(current, { best: contribution, becauseItemId: r.sourceItemId, relation: r.relation });
  }
  const sorted = [...byTarget.entries()]
    .map(([itemId, c]) => ({ itemId, score: round(c.score), becauseItemId: c.becauseItemId, relation: c.relation, sources: c.sources.size }))
    .sort((a, b) => b.score - a.score || b.sources - a.sources || a.itemId.localeCompare(b.itemId));
  const perSource = new Map<string, number>();
  const out: ContentCandidate[] = [];
  for (const c of sorted) {
    const used = perSource.get(c.becauseItemId) ?? 0;
    if (used >= params.maxPerSource) continue;
    perSource.set(c.becauseItemId, used + 1);
    out.push(c);
  }
  return out;
}

/**
 * Respaldos (fase 9) para que el mazo no se agote mientras haya algo honesto que enseñar (decisión del usuario,
 * 2026-10-14: «un número que tienda al infinito, al estilo de Tinder»). Van DESPUÉS de los bloques principales y cada
 * tarjeta dice de dónde sale; nunca se presentan como consenso, descubrimiento ni Trending.
 * - Comunidad: lo valorado positivamente por al menos 2 personas de APPINITY (cualquiera, sin afinidad ni zona), con
 *   media bayesiana que incluye los votos bajos.
 * - Conservados: lo que el usuario conservó en otra sesión (puede volver, §2).
 * - Explorar: objetos del catálogo sin señales, en un orden estable por usuario y día.
 */
export type FallbackBlock = 'content' | 'community' | 'kept' | 'explore';

export interface CommunityCandidate {
  itemId: string;
  score: number;
  supporters: number;
  opinionated: number;
}

export function communityCandidates(
  opinionsByItem: ReadonlyMap<string, readonly Opinion[]>,
  params: RecommendationParams = RECOMMENDATION_PARAMS_V1,
): CommunityCandidate[] {
  const out: CommunityCandidate[] = [];
  for (const [itemId, all] of opinionsByItem) {
    const opinions = [...new Map(all.map((o) => [o.userId, o])).values()];
    const supporters = opinions.filter((o) => o.score >= params.consensus.positiveScore && o.confidence >= params.consensus.positiveConfidence).length;
    if (supporters < params.consensus.minSupporters) continue;
    const sum = opinions.reduce((a, o) => a + o.score, 0);
    const score = (params.trending.priorWeight * params.trending.priorMean + sum) / (params.trending.priorWeight + opinions.length);
    if (score <= 0) continue;
    out.push({ itemId, score: round(score), supporters, opinionated: opinions.length });
  }
  return out.sort((a, b) => b.score - a.score || b.supporters - a.supporters || a.itemId.localeCompare(b.itemId));
}

/** Orden estable y variado para explorar: hash de usuario, día y objeto (FNV-1a). Mismo día, mismo orden. */
export function exploreOrder(itemIds: readonly string[], seed: string): string[] {
  const hash = (text: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    return h;
  };
  return [...itemIds].sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`) || a.localeCompare(b));
}
