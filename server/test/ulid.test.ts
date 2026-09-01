import { describe, expect, it } from 'vitest';
import { monotonicFactory, ulid } from 'ulidx';

describe('ulid ordering', () => {
  it('produces strictly increasing ids from the monotonic factory, even within the same millisecond', () => {
    const nextUlid = monotonicFactory();
    const ids = Array.from({ length: 1000 }, () => nextUlid());

    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
  });

  it('sorts lexicographically the same as chronologically for ids minted further apart in time', async () => {
    const first = ulid();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = ulid();

    expect(second > first).toBe(true);
    expect([second, first].sort()).toEqual([first, second]);
  });
});
