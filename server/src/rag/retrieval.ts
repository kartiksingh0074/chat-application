import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { messages, roomMembers } from '../db/schema.js';
import { reciprocalRankFusion, type FusedHit, type RankedHit } from './rrf.js';

/** The three modes 8.5 requires, selectable so 8.8 can measure each. */
export type RetrievalMode = 'keyword' | 'vector' | 'hybrid';

/** How many candidates each arm contributes before fusion. */
export const ARM_LIMIT = 50;

export interface RetrievedMessage {
  id: string;
  body: string | null;
  senderId: string;
  createdAt: Date;
  score: number;
}

export class NotAMemberError extends Error {
  constructor() {
    super('You are not a member of this room');
    this.name = 'NotAMemberError';
  }
}

/**
 * Membership check, run *before* any retrieval.
 *
 * 8.5 calls this non-negotiable, and the reason is subtle: filtering after a
 * top-k vector search still tells the caller that matching content exists.
 * Even returning zero rows from a room you cannot see leaks that the room has
 * something semantically close to your query. So the check gates the query
 * rather than the results.
 */
export async function assertRoomMember(roomId: string, userId: string): Promise<void> {
  const membership = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)),
  });
  if (!membership) throw new NotAMemberError();
}

/**
 * How the keyword arm combines the words of a question.
 *
 *   all  8.5's `plainto_tsquery`: every non-stopword must appear. Natural
 *        questions carry words their answers never use - "What was the root
 *        cause of INC-4471?" fails because the answer never says "root" - so on
 *        the evaluation set this returns nothing for 22 of 30 questions. Default,
 *        because it is what 8.5 specifies.
 *   any  the same stemmed terms joined with OR, so a partial match still
 *        counts. Kept for the evaluation.
 *
 * Neither weights rare terms more than common ones: `ts_rank` has no inverse
 * document frequency, unlike BM25, so a ticket id counts no more than "cause".
 */
export type KeywordMatch = 'all' | 'any';

/**
 * Keyword arm. `body_tsv` is a generated column with a GIN index, so the
 * match is an index lookup rather than a scan over the room's history.
 */
export async function keywordSearch(
  roomId: string,
  query: string,
  limit = ARM_LIMIT,
  match: KeywordMatch = 'all',
): Promise<RetrievedMessage[]> {
  // plainto_tsquery does the stemming and stopword removal either way; 'any'
  // only swaps its AND operators for OR.
  const tsquery =
    match === 'all'
      ? sql`plainto_tsquery('english', ${query})`
      : sql`replace(plainto_tsquery('english', ${query})::text, '&', '|')::tsquery`;

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
      score: sql<number>`ts_rank(${messages.bodyTsv}, ${tsquery})`,
    })
    .from(messages)
    .where(and(eq(messages.roomId, roomId), sql`${messages.bodyTsv} @@ ${tsquery}`))
    .orderBy(sql`ts_rank(${messages.bodyTsv}, ${tsquery}) DESC`)
    .limit(limit);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

/**
 * How the vector arm uses the HNSW index.
 *
 * There is one HNSW index across every room (8.2), and the room filter is in
 * the WHERE clause (8.5). pgvector applies that filter *after* walking the
 * graph, which by default visits only ~40 candidates - so on a shared index it
 * silently returns fewer rows than asked for. Measured on the 4-room corpus:
 * 27.7 rows of LIMIT 50 on average, and 78% agreement with an exact search on
 * the top 10. Rows from other rooms are still never returned, so this is a
 * recall problem, not a leak. On this corpus it changed no final score - the
 * answers ranked either first or well outside the top 10 - but the rows lost
 * grow as more rooms share the index.
 *
 *   iterative     pgvector 0.8 iterative scan: keeps walking until LIMIT is
 *                 met. ef_search 100 lifts top-10 agreement to 92.7%, and 200
 *                 or 400 add under a point; the scan itself costs no
 *                 measurable time. Default.
 *   hnsw-default  8.5's query exactly as written. Kept for the evaluation.
 *   exact         no index, brute force: 100% by definition. Kept as the
 *                 evaluation's upper bound; does not scale to large rooms.
 */
export type VectorStrategy = 'iterative' | 'hnsw-default' | 'exact';

const STRATEGY_SETTINGS: Record<VectorStrategy, string[]> = {
  iterative: ['SET LOCAL hnsw.iterative_scan = strict_order', 'SET LOCAL hnsw.ef_search = 100'],
  'hnsw-default': [],
  exact: ['SET LOCAL enable_indexscan = off'],
};

/**
 * Vector arm. The room filter is inside the WHERE clause of the search itself,
 * never applied to its output - see 8.5. `<=>` is pgvector's cosine distance, so
 * similarity is 1 minus it. Settings are SET LOCAL inside a transaction so they
 * cannot leak onto a pooled connection used by something else.
 */
export async function vectorSearch(
  roomId: string,
  queryEmbedding: number[],
  limit = ARM_LIMIT,
  strategy: VectorStrategy = 'iterative',
): Promise<RetrievedMessage[]> {
  // pgvector's text input format. Parameterised, never interpolated.
  const literal = `[${queryEmbedding.join(',')}]`;

  return db.transaction(async (tx) => {
    for (const setting of STRATEGY_SETTINGS[strategy]) await tx.execute(sql.raw(setting));

    // The vector appears exactly once. Drizzle turns every interpolation into
    // its own parameter, so writing the distance in both SELECT and ORDER BY -
    // the obvious form, and the one 8.5 shows - ships the ~4.5 KB vector twice.
    // That spreads the request over several TCP segments and hits a
    // delayed-ACK stall: 44 ms against 1.7 ms, while Postgres itself executes
    // in under 1 ms. Ordering by the output alias is still recognised as
    // `embedding <=> $n`, so the HNSW index is still used (checked with EXPLAIN).
    const rows = await tx.execute<{
      id: string;
      body: string | null;
      sender_id: string;
      created_at: Date;
      distance: number;
    }>(sql`
      SELECT m.id, m.body, m.sender_id, m.created_at,
             e.embedding <=> ${literal}::vector AS distance
      FROM message_embeddings e
      JOIN messages m ON m.id = e.message_id
      WHERE e.room_id = ${roomId}
      ORDER BY distance
      LIMIT ${limit}
    `);

    return rows.rows.map((r) => ({
      id: r.id,
      body: r.body,
      senderId: r.sender_id,
      createdAt: r.created_at,
      score: 1 - Number(r.distance),
    }));
  });
}

export interface RetrieveOptions {
  roomId: string;
  userId: string;
  query: string;
  mode: RetrievalMode;
  topK: number;
  /** Required for 'vector' and 'hybrid'; the caller embeds the question. */
  queryEmbedding?: number[];
  /** How the vector arm uses the index. Only the evaluation changes this. */
  vectorStrategy?: VectorStrategy;
  /** How the keyword arm combines terms. Only the evaluation changes this. */
  keywordMatch?: KeywordMatch;
  /**
   * Candidates each arm contributes before fusion. 8.5 uses 50. Only the
   * evaluation changes this, to show how fusion depth drives hybrid results.
   */
  armLimit?: number;
}

export interface RetrievalResult {
  messages: RetrievedMessage[];
  /** Fusion detail, for explaining why something ranked where it did. */
  fused: FusedHit[];
}

/**
 * The single entry point. Verifies membership, runs the requested arms, and
 * fuses them. Every caller goes through here so the membership check cannot be
 * skipped by reaching for an arm directly.
 */
export async function retrieve(options: RetrieveOptions): Promise<RetrievalResult> {
  const {
    roomId,
    userId,
    query,
    mode,
    topK,
    queryEmbedding,
    vectorStrategy = 'iterative',
    keywordMatch = 'all',
    armLimit = ARM_LIMIT,
  } = options;

  await assertRoomMember(roomId, userId);

  if ((mode === 'vector' || mode === 'hybrid') && !queryEmbedding) {
    throw new Error(`retrieval mode '${mode}' needs a query embedding`);
  }

  if (mode === 'keyword') {
    const hits = await keywordSearch(roomId, query, armLimit, keywordMatch);
    return {
      messages: hits.slice(0, topK),
      fused: hits.slice(0, topK).map((h, i) => ({
        messageId: h.id,
        score: h.score,
        ranks: { keyword: i + 1 },
      })),
    };
  }

  if (mode === 'vector') {
    const hits = await vectorSearch(roomId, queryEmbedding!, armLimit, vectorStrategy);
    return {
      messages: hits.slice(0, topK),
      fused: hits.slice(0, topK).map((h, i) => ({
        messageId: h.id,
        score: h.score,
        ranks: { vector: i + 1 },
      })),
    };
  }

  // Hybrid: both arms in parallel, fused by rank.
  const [keywordHits, vectorHits] = await Promise.all([
    keywordSearch(roomId, query, armLimit, keywordMatch),
    vectorSearch(roomId, queryEmbedding!, armLimit, vectorStrategy),
  ]);

  const toRanked = (hits: RetrievedMessage[]): RankedHit[] =>
    hits.map((h) => ({ messageId: h.id, score: h.score }));

  const fused = reciprocalRankFusion({
    keyword: toRanked(keywordHits),
    vector: toRanked(vectorHits),
  }).slice(0, topK);

  const byId = new Map<string, RetrievedMessage>();
  for (const hit of [...keywordHits, ...vectorHits]) byId.set(hit.id, hit);

  return {
    messages: fused
      .map((f) => {
        const message = byId.get(f.messageId);
        return message ? { ...message, score: f.score } : null;
      })
      .filter((m): m is RetrievedMessage => m !== null),
    fused,
  };
}
