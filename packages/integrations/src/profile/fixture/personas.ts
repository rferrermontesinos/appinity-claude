import type { FixtureSourceKey } from '@appinity/shared';

/**
 * Personas SINTÉTICAS de la demo (fase 6). Su actividad no se escribe a mano: se DERIVA de forma determinista de la de
 * las personas de demo existentes, para que compartan objetos del catálogo y el ranking de almas gemelas tenga casos
 * variados (muy afín, contraria, mixta, con poca evidencia). Los objetos son reales (instantánea de Wikidata); las
 * valoraciones son inventadas.
 *
 * Modos:
 * - `same`: las mismas valoraciones (y horas o escuchas escaladas un 10 %).
 * - `similar`: igual, pero una de cada tres valoraciones un paso más cerca del término medio.
 * - `inverse`: la valoración opuesta en la misma escala.
 * - `first3`: solo los tres primeros registros (poca evidencia), con las mismas valoraciones.
 */
export type PersonaMode = 'same' | 'similar' | 'inverse' | 'first3';

export interface PersonaRecipe {
  from: string;
  mode: PersonaMode;
}

const LAURA = '00000000-0000-4000-a000-000000000001';
const ALEX = '00000000-0000-4000-a000-000000000002';
const MARTA = '00000000-0000-4000-a000-000000000003';
const NURIA = '00000000-0000-4000-a000-000000000005';

export const PERSONA_RECIPES: Record<string, Partial<Record<FixtureSourceKey, PersonaRecipe>>> = {
  // Clara: gemela de Laura en cine, series y libros (mismas notas) y parecida en lugares.
  '00000000-0000-4000-a000-000000000007': {
    fixture_screen: { from: LAURA, mode: 'same' },
    fixture_diary: { from: LAURA, mode: 'same' },
    fixture_activity: { from: LAURA, mode: 'similar' },
  },
  // Pau: lo contrario de Laura en cine, series y libros.
  '00000000-0000-4000-a000-000000000008': {
    fixture_screen: { from: LAURA, mode: 'inverse' },
    fixture_diary: { from: LAURA, mode: 'inverse' },
  },
  // Iris: como Marta en restaurantes y cultura.
  '00000000-0000-4000-a000-000000000009': { fixture_activity: { from: MARTA, mode: 'similar' } },
  // Leo: como Àlex en videojuegos y música.
  '00000000-0000-4000-a000-000000000010': { fixture_play: { from: ALEX, mode: 'same' }, fixture_audio: { from: ALEX, mode: 'same' } },
  // Ona: como Núria en series y podcasts.
  '00000000-0000-4000-a000-000000000011': { fixture_screen: { from: NURIA, mode: 'same' }, fixture_audio: { from: NURIA, mode: 'similar' } },
  // Teo: cine como Laura y restaurantes al revés que Marta (afinidades por categoría muy distintas).
  '00000000-0000-4000-a000-000000000012': { fixture_screen: { from: LAURA, mode: 'same' }, fixture_activity: { from: MARTA, mode: 'inverse' } },
  // Vera: muy poca evidencia en común con Laura.
  '00000000-0000-4000-a000-000000000013': { fixture_screen: { from: LAURA, mode: 'first3' } },
};

type Raw = Record<string, unknown>;

/** Valor intermedio de cada escala (para `similar`). */
const toward = (value: number, middle: number, step: number) => (value > middle ? value - step : value < middle ? value + step : value);

function transform(source: FixtureSourceKey, record: Raw, mode: PersonaMode, index: number, prefix: string): Raw {
  const soften = mode === 'similar' && index % 3 === 0;
  const withId = (key: string) => (typeof record[key] === 'string' ? { [key]: `${prefix}-${record[key] as string}` } : {});
  switch (source) {
    case 'fixture_screen': {
      const rating = record.rating as number | undefined;
      if (rating === undefined) return { ...record, ...withId('id') };
      const next = mode === 'inverse' ? 11 - rating : soften ? toward(rating, 5.5, 1) : rating;
      return { ...record, ...withId('id'), rating: Math.round(next) };
    }
    case 'fixture_diary': {
      const stars = record.stars as number | undefined;
      if (stars === undefined) return { ...record, ...withId('entryId') };
      const next = mode === 'inverse' ? 5.5 - stars : soften ? toward(stars, 2.75, 0.5) : stars;
      return { ...record, ...withId('entryId'), stars: Math.round(next * 2) / 2 };
    }
    case 'fixture_activity': {
      const stars = record.stars as number | undefined;
      const action = record.action as string;
      const flipped = mode === 'inverse' && action === 'thumbs_up' ? 'thumbs_down' : mode === 'inverse' && action === 'thumbs_down' ? 'thumbs_up' : action;
      if (stars === undefined) return { ...record, ...withId('activityId'), action: flipped };
      const next = mode === 'inverse' ? 6 - stars : soften ? toward(stars, 3, 1) : stars;
      return { ...record, ...withId('activityId'), action: flipped, stars: next };
    }
    case 'fixture_play':
      return { ...record, playtime_forever: Math.round((record.playtime_forever as number) * 1.1) };
    case 'fixture_audio': {
      const out: Raw = { ...record, ...withId('id') };
      if (typeof record.playcount === 'number') out.playcount = Math.round(record.playcount * (soften ? 0.6 : 0.9));
      if (Array.isArray(record.episodeIds)) out.episodeIds = (record.episodeIds as string[]).map((id) => `${prefix}-${id}`);
      return out;
    }
  }
}

/** Registros derivados de una persona sintética en una fuente (vacío si no tiene receta para esa fuente). */
export function personaRecords(source: FixtureSourceKey, userId: string, recordsOf: (userId: string) => unknown[]): unknown[] {
  const recipe = PERSONA_RECIPES[userId]?.[source];
  if (!recipe) return [];
  const base = recordsOf(recipe.from) as Raw[];
  const chosen = recipe.mode === 'first3' ? base.slice(0, 3) : base;
  const prefix = `p${userId.slice(-2)}`;
  return chosen.map((record, i) => transform(source, record, recipe.mode, i, prefix));
}
