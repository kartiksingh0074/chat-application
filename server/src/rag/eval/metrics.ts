/**
 * Retrieval metrics for PROJECT.md 8.8. Pure, so they are unit-tested
 * separately from the database-backed run.
 */

/** Share of the relevant messages that appear in the top k. */
export function recallAtK(retrieved: string[], relevant: ReadonlySet<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const top = retrieved.slice(0, k);
  return top.filter((id) => relevant.has(id)).length / relevant.size;
}

/**
 * 1 / rank of the first relevant result within the top k, or 0 when none
 * appears. Cut at k so MRR and recall@k describe the same window: a relevant
 * message at rank 40 counts for nothing in either.
 */
export function reciprocalRank(retrieved: string[], relevant: ReadonlySet<string>, k: number): number {
  const index = retrieved.slice(0, k).findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

/** 1-based rank of the first relevant result anywhere in the list, or null. */
export function firstRelevantRank(retrieved: string[], relevant: ReadonlySet<string>): number | null {
  const index = retrieved.findIndex((id) => relevant.has(id));
  return index === -1 ? null : index + 1;
}

/** Nearest-rank percentile. p in [0, 100]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

export const mean = (values: number[]) =>
  values.length === 0 ? Number.NaN : values.reduce((s, v) => s + v, 0) / values.length;
