import { describe, expect, it } from 'vitest';
import {
  firstRelevantRank,
  mean,
  percentile,
  reciprocalRank,
  recallAtK,
} from '../src/rag/eval/metrics.js';

const relevant = new Set(['a', 'b']);

describe('recallAtK', () => {
  it('is the share of relevant messages found in the top k', () => {
    expect(recallAtK(['a', 'x', 'y'], relevant, 10)).toBe(0.5);
    expect(recallAtK(['b', 'a'], relevant, 10)).toBe(1);
  });

  it('ignores anything past k', () => {
    const list = [...Array(10).fill('x'), 'a'];
    expect(recallAtK(list, relevant, 10)).toBe(0);
  });

  it('is 0 for an empty result, not NaN', () => {
    expect(recallAtK([], relevant, 10)).toBe(0);
    expect(recallAtK(['a'], new Set(), 10)).toBe(0);
  });
});

describe('reciprocalRank', () => {
  it('scores the first relevant hit only', () => {
    expect(reciprocalRank(['a', 'b'], relevant, 10)).toBe(1);
    expect(reciprocalRank(['x', 'y', 'b', 'a'], relevant, 10)).toBeCloseTo(1 / 3);
  });

  it('is cut at k, so it describes the same window as recall@k', () => {
    const list = [...Array(10).fill('x'), 'a'];
    expect(reciprocalRank(list, relevant, 10)).toBe(0);
  });
});

describe('firstRelevantRank', () => {
  it('is 1-based and null when absent', () => {
    expect(firstRelevantRank(['x', 'a'], relevant)).toBe(2);
    expect(firstRelevantRank(['x'], relevant)).toBeNull();
  });
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile([7], 95)).toBe(7);
  });

  it('does not reorder the caller’s array', () => {
    const values = [3, 1, 2];
    percentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('mean', () => {
  it('averages, and is NaN when empty rather than 0', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBeNaN();
  });
});
