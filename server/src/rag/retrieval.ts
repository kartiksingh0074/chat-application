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
 * Keyword arm. `body_tsv` is a generated column with a GIN index, so the
 * match is an index lookup rather than a scan over the room's history.
 */
export async function keywordSearch(
  roomId: string,
  query: string,
  limit = ARM_LIMIT,
): Promise<RetrievedMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
      score: sql<number>`ts_rank(${messages.bodyTsv}, plainto_tsquery('english', ${query}))`,
    })
    .from(messages)
    .where(
      and(
        eq(messages.roomId, roomId),
        sql`${messages.bodyTsv} @@ plainto_tsquery('english', ${query})`,
      ),
    )
    .orderBy(sql`ts_rank(${messages.bodyTsv}, plainto_tsquery('english', ${query})) DESC`)
    .limit(limit);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

/**
 * Vector arm. The room filter is inside the WHERE clause of the search itself,
 * not applied to its output - see 8.5. `<=>` is pgvector's cosine distance, so
 * similarity is 1 minus it.
 */
export async function vectorSearch(
  roomId: string,
  queryEmbedding: number[],
  limit = ARM_LIMIT,
): Promise<RetrievedMessage[]> {
  // pgvector's text input format. Parameterised, never interpolated.
  const literal = `[${queryEmbedding.join(',')}]`;

  const rows = await db.execute<{
    id: string;
    body: string | null;
    sender_id: string;
    created_at: Date;
    score: number;
  }>(sql`
    SELECT m.id, m.body, m.sender_id, m.created_at,
           1 - (e.embedding <=> ${literal}::vector) AS score
    FROM message_embeddings e
    JOIN messages m ON m.id = e.message_id
    WHERE e.room_id = ${roomId}
    ORDER BY e.embedding <=> ${literal}::vector
    LIMIT ${limit}
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    body: r.body,
    senderId: r.sender_id,
    createdAt: r.created_at,
    score: Number(r.score),
  }));
}

export interface RetrieveOptions {
  roomId: string;
  userId: string;
  query: string;
  mode: RetrievalMode;
  topK: number;
  /** Required for 'vector' and 'hybrid'; the caller embeds the question. */
  queryEmbedding?: number[];
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
  const { roomId, userId, query, mode, topK, queryEmbedding } = options;

  await assertRoomMember(roomId, userId);

  if ((mode === 'vector' || mode === 'hybrid') && !queryEmbedding) {
    throw new Error(`retrieval mode '${mode}' needs a query embedding`);
  }

  if (mode === 'keyword') {
    const hits = await keywordSearch(roomId, query);
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
    const hits = await vectorSearch(roomId, queryEmbedding!);
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
    keywordSearch(roomId, query),
    vectorSearch(roomId, queryEmbedding!),
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
