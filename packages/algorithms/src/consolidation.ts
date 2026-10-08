import { PREFERENCE_BASIS_PRIORITY, type PreferenceBasis } from '@appinity/shared';

/** Versión de las reglas de consolidación. Cambiarla permite recalcular desde las evidencias conservadas. */
export const CONSOLIDATION_VERSION = 'consolidation-v1';

/** Evidencia de un usuario sobre un objeto, ya normalizada y persistida. */
export interface EvidenceInput {
  id: string;
  sourceKey: string;
  knownConfidence: number;
  consumedConfidence: number;
  preferenceScore: number | null;
  preferenceConfidence: number | null;
  preferenceBasis: PreferenceBasis | null;
  occurredAt: Date | null;
  syncedAt: Date;
}

export interface ConsolidationNotes {
  /** Evidencia de menor prioridad ignorada para la preferencia (p. ej. asistencia frente a valoración). */
  overridden: Array<{ sourceKey: string; basis: PreferenceBasis; score: number }>;
  /** Fuentes del nivel ganador que discrepan (signos opuestos o diferencia ≥ 1). */
  disagreement: Array<{ sourceKey: string; score: number }>;
  /** Valoraciones de la misma fuente sustituidas por otra posterior. */
  supersededInSource: number;
}

export interface ConsolidatedProfile {
  knownConfidence: number;
  consumedConfidence: number;
  preferenceScore: number | null;
  preferenceConfidence: number | null;
  preferenceBasis: PreferenceBasis | null;
  evidenceCount: number;
  sourceCount: number;
  hasConflict: boolean;
  notes: ConsolidationNotes;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  consolidationVersion: string;
}

/** Diferencia mínima con signos opuestos para considerar que dos fuentes discrepan. */
const DISAGREEMENT_MIN_ABS = 0.2;

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Orden de recencia dentro de una fuente: fecha de actividad, después sync, después id (estable). */
function newerFirst(a: EvidenceInput, b: EvidenceInput): number {
  const ao = a.occurredAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bo = b.occurredAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (ao !== bo) return bo - ao;
  const as = a.syncedAt.getTime();
  const bs = b.syncedAt.getTime();
  if (as !== bs) return bs - as;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Consolida las evidencias de un usuario sobre un objeto (§10). Reglas v1:
 *
 * - Known y Consumed: máximo de las confianzas. No se suman evidencias correlacionadas ni duplicadas, así que
 *   tres fuentes no inflan la confianza.
 * - Preference: gana el nivel de mayor prioridad presente (valoración explícita > like/dislike > conducta fuerte
 *   > asistencia > conducta débil). Dentro de ese nivel se toma la evidencia más reciente de cada fuente y se
 *   combinan las fuentes por media ponderada por confianza. La confianza resultante es la máxima, no la suma.
 * - Sin ninguna preferencia: NULL (falta de evidencia), nunca 0.
 * - Se registran las discrepancias entre fuentes y la evidencia de menor prioridad descartada.
 */
export function consolidate(evidence: readonly EvidenceInput[]): ConsolidatedProfile {
  if (evidence.length === 0) throw new Error('No se puede consolidar sin evidencias');

  const knownConfidence = Math.max(...evidence.map((e) => e.knownConfidence));
  const consumedConfidence = Math.max(...evidence.map((e) => e.consumedConfidence));
  const sources = new Set(evidence.map((e) => e.sourceKey));
  const dated = evidence.map((e) => e.occurredAt?.getTime()).filter((t): t is number => t !== undefined);

  const notes: ConsolidationNotes = { overridden: [], disagreement: [], supersededInSource: 0 };
  const withPreference = evidence.filter(
    (e): e is EvidenceInput & { preferenceScore: number; preferenceConfidence: number; preferenceBasis: PreferenceBasis } =>
      e.preferenceScore !== null && e.preferenceConfidence !== null && e.preferenceBasis !== null,
  );

  let preferenceScore: number | null = null;
  let preferenceConfidence: number | null = null;
  let preferenceBasis: PreferenceBasis | null = null;
  let hasConflict = false;

  if (withPreference.length > 0) {
    const topPriority = Math.max(...withPreference.map((e) => PREFERENCE_BASIS_PRIORITY[e.preferenceBasis]));
    const winners = withPreference.filter((e) => PREFERENCE_BASIS_PRIORITY[e.preferenceBasis] === topPriority);
    preferenceBasis = winners[0]!.preferenceBasis;

    // Última evidencia por fuente dentro del nivel ganador.
    const latestBySource = new Map<string, (typeof winners)[number]>();
    for (const e of winners.toSorted(newerFirst)) {
      if (latestBySource.has(e.sourceKey)) notes.supersededInSource += 1;
      else latestBySource.set(e.sourceKey, e);
    }
    const perSource = [...latestBySource.values()];
    const weight = perSource.reduce((sum, e) => sum + e.preferenceConfidence, 0);
    preferenceScore = round4(perSource.reduce((sum, e) => sum + e.preferenceScore * e.preferenceConfidence, 0) / weight);
    preferenceConfidence = round4(Math.max(...perSource.map((e) => e.preferenceConfidence)));

    const scores = perSource.map((e) => e.preferenceScore);
    const opposite =
      scores.some((s) => s >= DISAGREEMENT_MIN_ABS) && scores.some((s) => s <= -DISAGREEMENT_MIN_ABS);
    const spread = Math.max(...scores) - Math.min(...scores);
    if (perSource.length > 1 && (opposite || spread >= 1)) {
      hasConflict = true;
      notes.disagreement = perSource.map((e) => ({ sourceKey: e.sourceKey, score: e.preferenceScore }));
    }

    notes.overridden = withPreference
      .filter((e) => PREFERENCE_BASIS_PRIORITY[e.preferenceBasis] < topPriority)
      .map((e) => ({ sourceKey: e.sourceKey, basis: e.preferenceBasis, score: e.preferenceScore }));
  }

  return {
    knownConfidence: round4(knownConfidence),
    consumedConfidence: round4(consumedConfidence),
    preferenceScore,
    preferenceConfidence,
    preferenceBasis,
    evidenceCount: evidence.length,
    sourceCount: sources.size,
    hasConflict,
    notes,
    firstSeenAt: dated.length ? new Date(Math.min(...dated)) : null,
    lastSeenAt: dated.length ? new Date(Math.max(...dated)) : null,
    consolidationVersion: CONSOLIDATION_VERSION,
  };
}
