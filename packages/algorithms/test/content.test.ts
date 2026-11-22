import { describe, expect, it } from 'vitest';
import { contentCandidates } from '../src/recommendation.js';

describe('Recomendación por contenido (arranque en frío)', () => {
  const rel = (sourceItemId: string, targetItemId: string, relation = 'same_director', weight = 0.8) => ({ sourceItemId, targetItemId, relation, weight });

  it('solo los gustos claros recomiendan; un disgusto o algo solo conocido no', () => {
    const out = contentCandidates(
      [
        { itemId: 'gusta', score: 1, confidence: 0.9 },
        { itemId: 'tibio', score: 0.1, confidence: 0.9 },
        { itemId: 'disgusta', score: -1, confidence: 1 },
      ],
      [rel('gusta', 'a'), rel('tibio', 'b'), rel('disgusta', 'c')],
    );
    expect(out.map((c) => c.itemId)).toEqual(['a']);
    expect(out[0]).toMatchObject({ becauseItemId: 'gusta', relation: 'same_director', score: 0.72, sources: 1 });
  });

  it('dos gustos que llevan al mismo objeto suman; dos relaciones desde el mismo gusto no cuentan doble', () => {
    const out = contentCandidates(
      [
        { itemId: 'g1', score: 1, confidence: 1 },
        { itemId: 'g2', score: 1, confidence: 1 },
      ],
      [rel('g1', 'x', 'same_series', 1), rel('g1', 'x', 'same_director', 0.8), rel('g2', 'x', 'same_director', 0.8), rel('g1', 'y', 'same_series', 1)],
    );
    expect(out[0]).toMatchObject({ itemId: 'x', score: 1.8, sources: 2, relation: 'same_series', becauseItemId: 'g1' });
    expect(out[1]).toMatchObject({ itemId: 'y', score: 1 });
  });

  it('no recomienda lo que ya le gusta y limita a 3 por gusto de origen (variedad)', () => {
    const likes = [{ itemId: 'saga1', score: 1, confidence: 1 }, { itemId: 'saga2', score: 1, confidence: 1 }];
    const out = contentCandidates(likes, [rel('saga1', 'saga2'), ...['a', 'b', 'c', 'd', 'e'].map((t) => rel('saga1', t))]);
    expect(out.map((c) => c.itemId)).not.toContain('saga2');
    expect(out).toHaveLength(3);
  });
});
