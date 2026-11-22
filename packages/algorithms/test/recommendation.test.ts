import { describe, expect, it } from 'vitest';
import {
  RECOMMENDATION_VERSION,
  consensusCandidates,
  currentYear,
  discoveryCandidates,
  mixRecommendations,
  followedCandidates,
  trendingCandidates,
  type Opinion,
} from '../src/recommendation.js';

const op = (userId: string, score: number, confidence = 1): Opinion => ({ userId, score, confidence });

describe(`recomendador ${RECOMMENDATION_VERSION}`, () => {
  it('consenso: apoyos positivos únicos, una persona = un voto, y el desacuerdo resta', () => {
    const result = consensusCandidates(
      new Map([
        ['a', [op('u1', 1), op('u2', 1), op('u3', 1)]],
        ['b', [op('u1', 1), op('u2', 1), op('u3', -1), op('u4', -1)]],
        ['c', [op('u1', 1)]], // un solo apoyo: no es consenso
        ['d', [op('u1', 1), op('u1', 1), op('u1', 1)]], // la misma persona tres veces: un solo apoyo
      ]),
    );
    expect(result.map((r) => r.itemId)).toEqual(['a', 'b']);
    expect(result[0]).toMatchObject({ supporters: 3, opinionated: 3 });
    expect(result[1]).toMatchObject({ supporters: 2, opinionated: 4 });
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it('descubrimiento: gustos fuertes de una persona muy afín, atribuidos a ella; la afinidad de la categoría manda', () => {
    const result = discoveryCandidates([
      { userId: 'laura', affinity: 80, categoryAffinity: {}, preferences: [{ itemId: 'x', category: 'movies', score: 1, confidence: 1 }] },
      // Afinidad global alta pero baja en restaurantes: su restaurante no entra.
      { userId: 'teo', affinity: 90, categoryAffinity: { food: 20 }, preferences: [{ itemId: 'y', category: 'food', score: 1, confidence: 1 }] },
      // Afinidad baja: no es «realmente afín».
      { userId: 'pau', affinity: 30, categoryAffinity: {}, preferences: [{ itemId: 'z', category: 'books', score: 1, confidence: 1 }] },
      // Gusto tibio: no basta.
      { userId: 'ona', affinity: 95, categoryAffinity: {}, preferences: [{ itemId: 'w', category: 'series', score: 0.5, confidence: 1 }] },
    ]);
    expect(result).toEqual([{ itemId: 'x', score: 0.8, contributorId: 'laura', contributorAffinity: 80 }]);
  });

  it('Trending: mínimo de votantes únicos, media bayesiana con votos altos y bajos, sin peso por afinidad', () => {
    const five = ['v1', 'v2', 'v3', 'v4', 'v5'];
    const result = trendingCandidates(
      new Map([
        ['popular', five.map((v) => op(v, 1))],
        ['dividido', [...five.slice(0, 3).map((v) => op(v, 1)), op('v4', -1), op('v5', -1)]],
        ['pocos', five.slice(0, 4).map((v) => op(v, 1))],
        ['repetido', [op('v1', 1), op('v1', 1), op('v1', 1), op('v1', 1), op('v1', 1)]],
      ]),
    );
    expect(result.map((r) => r.itemId)).toEqual(['popular']);
    expect(result[0]).toMatchObject({ positiveVoters: 5, totalVoters: 5, averageScore: 1, score: 0.625 });
  });

  it('mezcla 7/2/1 por tandas de 10 y, sin candidatos de un bloque, cede su hueco sin inventar nada', () => {
    const list = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ itemId: `${prefix}${i}` }));
    const full = mixRecommendations({ consensus: list('c', 20), discovery: list('d', 5), trending: list('t', 5) }, 10);
    expect(full.map((r) => r.block)).toEqual(['consensus', 'consensus', 'consensus', 'consensus', 'consensus', 'consensus', 'consensus', 'discovery', 'discovery', 'trending']);
    // Sin Trending: su hueco lo ocupa el consenso, marcado como relleno.
    const noTrending = mixRecommendations({ consensus: list('c', 20), discovery: list('d', 5), trending: [] }, 10);
    expect(noTrending[9]).toMatchObject({ block: 'consensus', fillsFor: 'trending' });
    // Con pocos candidatos en total, se devuelven solo los que hay.
    expect(mixRecommendations({ consensus: list('c', 2), discovery: [], trending: list('t', 1) }, 10)).toHaveLength(3);
    // Un mismo objeto en dos bloques aparece una sola vez.
    const dup = mixRecommendations({ consensus: [{ itemId: 'x' }], discovery: [{ itemId: 'x' }], trending: [] }, 10);
    expect(dup).toHaveLength(1);
  });

  it('seguidos (2026-10-26): gustos fuertes de quien sigues, 1 de cada 10; sin seguidos, su hueco vuelve al descubrimiento', () => {
    const list = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ itemId: `${prefix}${i}` }));
    const followed = followedCandidates([
      { userId: 'rosalia', preferences: [{ itemId: 'x', score: 0.9, confidence: 0.9 }, { itemId: 'y', score: 0.5, confidence: 1 }] },
      { userId: 'amiga', preferences: [{ itemId: 'x', score: 1, confidence: 0.6 }] },
    ]);
    // «y» no llega al umbral de gusto fuerte; «x» se atribuye a quien más lo respalda.
    expect(followed).toEqual([{ itemId: 'x', score: 0.81, contributorId: 'rosalia' }]);
    const mixed = mixRecommendations({ consensus: list('c', 20), discovery: list('d', 5), followed: list('f', 5), trending: list('t', 5) }, 10);
    expect(mixed.map((r) => r.block)).toEqual(['consensus', 'consensus', 'consensus', 'consensus', 'consensus', 'consensus', 'consensus', 'discovery', 'followed', 'trending']);
    const noFollowed = mixRecommendations({ consensus: list('c', 20), discovery: list('d', 5), trending: list('t', 5) }, 10);
    expect(noFollowed[8]).toMatchObject({ block: 'discovery', fillsFor: 'followed' });
  });

  it('el año actual sale del reloj y de la zona horaria del usuario', () => {
    const newYearsEve = new Date('2026-12-31T23:30:00Z');
    expect(currentYear(newYearsEve, 'UTC')).toBe(2026);
    expect(currentYear(newYearsEve, 'Europe/Madrid')).toBe(2027);
    expect(currentYear(newYearsEve, 'America/New_York')).toBe(2026);
  });
});
