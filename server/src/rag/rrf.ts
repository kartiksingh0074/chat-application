/**
 * Reciprocal Rank Fusion (PROJECT.md 8.5).
 *
 * Combines two ranked lists without needing their scores to be comparable,
 * which matters here because they are not: `ts_rank` and cosine similarity are
 * on entirely different scales, so adding or averaging them would let whichever
 * arm happens to produce larger numbers dominate. RRF throws the scores away
 * and uses only position.
 *
 *   score(d) = Σ  1 / (K + rank_i(d))
 *
 * K damps the contribution of top positions so a single arm ranking something
 * first cannot by itself beat a document both arms rank highly. 60 is the value
 * from the original RRF paper and the one 8.5 specifies.
 */

export const RRF_K = 60;

export interface RankedHit {
  messageId: string;
  /** The arm's own score. Kept for reporting; deliberately not used in fusion. */
  score: number;
}

export interface FusedHit {
  messageId: string;
  score: number;
  /** 1-based rank in each arm that returned it, for explaining a result. */
  ranks: Record<string, number>;
}

/**
 * Fuse any number of named ranked lists. Each list must already be sorted best
 * first; only order is read, never the scores.
 */
export function reciprocalRankFusion(
  lists: Record<string, RankedHit[]>,
  k: number = RRF_K,
): FusedHit[] {
  const fused = new Map<string, FusedHit>();

  for (const [arm, hits] of Object.entries(lists)) {
    hits.forEach((hit, index) => {
      const rank = index + 1;
      const existing = fused.get(hit.messageId);
      if (existing) {
        // A document already seen in another arm. Guard against the same arm
        // listing it twice, which would otherwise count it twice.
        if (existing.ranks[arm] !== undefined) return;
        existing.score += 1 / (k + rank);
        existing.ranks[arm] = rank;
        return;
      }
      fused.set(hit.messageId, {
        messageId: hit.messageId,
        score: 1 / (k + rank),
        ranks: { [arm]: rank },
      });
    });
  }

  return [...fused.values()].sort(
    // Ties broken by id so the ordering is deterministic across runs, which
    // matters when the same query is measured repeatedly in 8.8.
    (a, b) => b.score - a.score || a.messageId.localeCompare(b.messageId),
  );
}
