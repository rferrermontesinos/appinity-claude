import { AFFINITY_VERSION, RECOMMENDATION_PARAMS_V1, RECOMMENDATION_VERSION } from '@appinity/algorithms';
import type { TransparencyDto } from '@appinity/shared';
import { PASS_RETURN_DAYS } from './recommendations.js';
import { CONSENSUS_SOULMATES } from './soulmates.js';
import { VOTE_PREFERENCE } from './votes.js';

/**
 * «Cómo funciona APPINITY» (2026-10-27): las cifras que enseña la app salen de las MISMAS constantes que usa el motor,
 * así la página no puede contar algo distinto de lo que se calcula. Sin datos personales: es pública.
 *
 * Principio de producto (decisión del titular, 2026-10-27): el ranking de personas y la afinidad solo leen gustos
 * (preferencias de obras). Nunca la cara ni las fotos, la galería, la edad, el género o el origen, la popularidad
 * (seguidores, amistades, solicitudes, likes recibidos), el tiempo mirando una tarjeta ni los mensajes. Lo comprueba
 * el test «el ranking de personas no usa popularidad ni datos personales» (soulmates.int.test.ts).
 */
export const NEVER_USED = ['photos', 'gallery', 'demographics', 'popularity', 'dwellTime', 'messages'] as const;

export function transparencyFacts(): TransparencyDto {
  const p = RECOMMENDATION_PARAMS_V1;
  const mixTotal = p.mix.consensus + p.mix.discovery + p.mix.followed + p.mix.trending;
  const pct = (w: number) => Math.round((100 * w) / mixTotal);
  return {
    affinityVersion: AFFINITY_VERSION,
    recommendationVersion: RECOMMENDATION_VERSION,
    votes: { dislike: VOTE_PREFERENCE[-1], like: VOTE_PREFERENCE[1], love: VOTE_PREFERENCE[2] },
    consensus: { soulmates: CONSENSUS_SOULMATES, minSupporters: p.consensus.minSupporters },
    discovery: { minAffinity: p.discovery.minAffinity },
    trending: { minVoters: p.trending.minVoters },
    // 70/20/10: el 20 % de descubrimiento incluye la parte de personas que sigues.
    mix: { consensus: pct(p.mix.consensus), discovery: pct(p.mix.discovery + p.mix.followed), followed: pct(p.mix.followed), trending: pct(p.mix.trending) },
    unknownReturnDays: PASS_RETURN_DAYS,
    neverUsed: [...NEVER_USED],
  };
}
