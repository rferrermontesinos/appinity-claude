import type { PreferenceBasis } from '@appinity/shared';
import { describe, expect, it } from 'vitest';
import { CONSOLIDATION_VERSION, consolidate, type EvidenceInput } from '../src/consolidation.js';

let seq = 0;
function ev(partial: Partial<EvidenceInput>): EvidenceInput {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    sourceKey: 'src_a',
    knownConfidence: 1,
    consumedConfidence: 0,
    preferenceScore: null,
    preferenceConfidence: null,
    preferenceBasis: null,
    occurredAt: null,
    syncedAt: new Date('2026-10-01T00:00:00Z'),
    ...partial,
  };
}

const pref = (score: number, basis: PreferenceBasis, confidence = 1) => ({
  preferenceScore: score,
  preferenceConfidence: confidence,
  preferenceBasis: basis,
});

describe('consolidación v1', () => {
  it('watchlist: conocido, no consumido, preferencia NULL (no 0)', () => {
    const p = consolidate([ev({ knownConfidence: 1, consumedConfidence: 0 })]);
    expect(p).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null, preferenceBasis: null });
    expect(p.consolidationVersion).toBe(CONSOLIDATION_VERSION);
  });

  it('visto sin valoración conserva preferencia NULL', () => {
    const p = consolidate([ev({ consumedConfidence: 1 })]);
    expect(p.consumedConfidence).toBe(1);
    expect(p.preferenceScore).toBeNull();
    expect(p.preferenceConfidence).toBeNull();
  });

  it('una valoración negativa explícita prevalece sobre una asistencia +1 posterior', () => {
    const p = consolidate([
      ev({ sourceKey: 'places', consumedConfidence: 1, ...pref(1, 'attendance', 0.7), occurredAt: new Date('2026-06-01') }),
      ev({ sourceKey: 'places', consumedConfidence: 1, ...pref(-0.5, 'explicit_rating'), occurredAt: new Date('2026-05-01') }),
    ]);
    expect(p.preferenceScore).toBe(-0.5);
    expect(p.preferenceBasis).toBe('explicit_rating');
    expect(p.notes.overridden).toEqual([{ sourceKey: 'places', basis: 'attendance', score: 1 }]);
  });

  it('se queda con la última valoración de cada fuente', () => {
    const p = consolidate([
      ev({ ...pref(0.2, 'explicit_rating'), occurredAt: new Date('2025-01-01') }),
      ev({ ...pref(0.9, 'explicit_rating'), occurredAt: new Date('2026-01-01') }),
    ]);
    expect(p.preferenceScore).toBe(0.9);
    expect(p.notes.supersededInSource).toBe(1);
  });

  it('una fecha conocida es más reciente que una desconocida', () => {
    const p = consolidate([
      ev({ ...pref(-1, 'explicit_rating'), occurredAt: null }),
      ev({ ...pref(0.6, 'explicit_rating'), occurredAt: new Date('2020-01-01') }),
    ]);
    expect(p.preferenceScore).toBe(0.6);
  });

  it('tres fuentes del mismo objeto no inflan conocimiento, consumo ni confianza', () => {
    const p = consolidate([
      ev({ sourceKey: 'a', knownConfidence: 0.8, consumedConfidence: 0.5, ...pref(0.8, 'explicit_rating', 0.9) }),
      ev({ sourceKey: 'b', knownConfidence: 0.8, consumedConfidence: 0.5, ...pref(0.8, 'explicit_rating', 0.9) }),
      ev({ sourceKey: 'c', knownConfidence: 0.8, consumedConfidence: 0.5, ...pref(0.8, 'explicit_rating', 0.9) }),
    ]);
    expect(p.knownConfidence).toBe(0.8);
    expect(p.consumedConfidence).toBe(0.5);
    expect(p.preferenceScore).toBe(0.8);
    expect(p.preferenceConfidence).toBe(0.9);
    expect(p.sourceCount).toBe(3);
    expect(p.evidenceCount).toBe(3);
    expect(p.hasConflict).toBe(false);
  });

  it('combina valoraciones de fuentes distintas por confianza y registra el conflicto', () => {
    const p = consolidate([
      ev({ sourceKey: 'a', ...pref(1, 'explicit_rating', 1) }),
      ev({ sourceKey: 'b', ...pref(-0.6, 'explicit_rating', 0.6) }),
    ]);
    expect(p.preferenceScore).toBeCloseTo((1 * 1 + -0.6 * 0.6) / 1.6, 4);
    expect(p.preferenceConfidence).toBe(1);
    expect(p.hasConflict).toBe(true);
    expect(p.notes.disagreement).toHaveLength(2);
  });

  it('un like explícito prevalece sobre la conducta, que prevalece sobre la asistencia', () => {
    expect(
      consolidate([ev({ ...pref(0.3, 'strong_behavior', 0.6) }), ev({ sourceKey: 'b', ...pref(-0.8, 'explicit_like', 0.9) })])
        .preferenceBasis,
    ).toBe('explicit_like');
    expect(
      consolidate([ev({ ...pref(1, 'attendance', 0.7) }), ev({ sourceKey: 'b', ...pref(0.4, 'strong_behavior', 0.6) })])
        .preferenceScore,
    ).toBe(0.4);
  });

  it('calcula el rango de fechas de actividad e ignora las ausentes', () => {
    const p = consolidate([
      ev({ occurredAt: new Date('2026-02-01T10:00:00Z') }),
      ev({ occurredAt: null }),
      ev({ occurredAt: new Date('2025-07-01T10:00:00Z') }),
    ]);
    expect(p.firstSeenAt?.toISOString()).toBe('2025-07-01T10:00:00.000Z');
    expect(p.lastSeenAt?.toISOString()).toBe('2026-02-01T10:00:00.000Z');
    expect(consolidate([ev({})]).firstSeenAt).toBeNull();
  });

  it('es determinista ante el orden de entrada', () => {
    const items = [
      ev({ sourceKey: 'a', ...pref(0.5, 'explicit_rating', 0.8), occurredAt: new Date('2026-01-01') }),
      ev({ sourceKey: 'b', ...pref(-0.4, 'explicit_rating', 1), occurredAt: new Date('2026-02-01') }),
      ev({ sourceKey: 'a', ...pref(0.1, 'explicit_rating', 0.8), occurredAt: new Date('2025-01-01') }),
    ];
    expect(consolidate(items)).toEqual(consolidate(items.toReversed()));
  });

  it('no consolida una lista vacía', () => {
    expect(() => consolidate([])).toThrow();
  });
});
