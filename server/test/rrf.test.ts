import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion, RRF_K } from '../src/rag/rrf.js';

const hit = (messageId: string, score = 0) => ({ messageId, score });

describe('reciprocalRankFusion', () => {
  it('scores a single list by 1/(K + rank)', () => {
    const [first, second] = reciprocalRankFusion({ keyword: [hit('a'), hit('b')] });
    expect(first!.score).toBeCloseTo(1 / (RRF_K + 1));
    expect(second!.score).toBeCloseTo(1 / (RRF_K + 2));
  });

  it('rewards a document both arms rank, over one either ranks first', () => {
    // The whole point of hybrid: agreement beats a single strong opinion.
    const fused = reciprocalRankFusion({
      keyword: [hit('solo-keyword'), hit('agreed')],
      vector: [hit('solo-vector'), hit('agreed')],
    });
    expect(fused[0]!.messageId).toBe('agreed');
    expect(fused[0]!.ranks).toEqual({ keyword: 2, vector: 2 });
  });

  it('ignores the arms’ own scores, which are on incomparable scales', () => {
    // ts_rank is ~0.06 while cosine similarity is ~0.9. If fusion looked at
    // magnitude the vector arm would always win; only rank may matter.
    const fused = reciprocalRankFusion({
      keyword: [{ messageId: 'k', score: 0.0001 }],
      vector: [{ messageId: 'v', score: 0.99 }],
    });
    expect(fused[0]!.score).toBeCloseTo(fused[1]!.score);
  });

  it('does not double-count a document listed twice by one arm', () => {
    const fused = reciprocalRankFusion({ keyword: [hit('a'), hit('a')] });
    expect(fused).toHaveLength(1);
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1));
  });

  it('keeps documents only one arm found', () => {
    const fused = reciprocalRankFusion({ keyword: [hit('k')], vector: [hit('v')] });
    expect(fused.map((f) => f.messageId).sort()).toEqual(['k', 'v']);
  });

  it('breaks ties deterministically, so repeated 8.8 runs agree', () => {
    const once = reciprocalRankFusion({ keyword: [hit('b')], vector: [hit('a')] });
    const twice = reciprocalRankFusion({ vector: [hit('a')], keyword: [hit('b')] });
    expect(once.map((f) => f.messageId)).toEqual(twice.map((f) => f.messageId));
  });

  it('handles empty arms', () => {
    expect(reciprocalRankFusion({ keyword: [], vector: [] })).toEqual([]);
    expect(reciprocalRankFusion({})).toEqual([]);
  });

  it('respects a custom K', () => {
    const [first] = reciprocalRankFusion({ keyword: [hit('a')] }, 1);
    expect(first!.score).toBeCloseTo(1 / 2);
  });
});
