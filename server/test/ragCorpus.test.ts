import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DISTRACTORS, PLANTED, QUESTIONS } from '../src/rag/corpus/facts.js';
import { buildCorpus, containsForbidden } from '../src/rag/corpus/filler.js';

/**
 * Integrity of the 8.8 ground truth. If any of these fail, the evaluation's
 * numbers would be measuring a broken answer key rather than the retriever.
 */

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://chatapp:chatapp@localhost:5433/chatapp';
  process.env.REDIS_URL ??= 'redis://redis:6379';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.CORS_ORIGIN ??= 'http://localhost:5173';
});

const planted = new Map(PLANTED.map((m) => [m.key, m]));

describe('answer key', () => {
  it('has 30 questions, as 8.8 specifies', () => {
    expect(QUESTIONS).toHaveLength(30);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(30);
  });

  it('points every question at planted messages that exist', () => {
    for (const q of QUESTIONS) {
      expect(q.relevant.length, q.id).toBeGreaterThan(0);
      for (const key of q.relevant) expect(planted.has(key), `${q.id} -> ${key}`).toBe(true);
    }
  });

  it('asks each question in the room its answer lives in', () => {
    // The bot answers within one room (8.2), so an answer elsewhere is unreachable.
    for (const q of QUESTIONS) {
      for (const key of q.relevant) expect(planted.get(key)!.room, `${q.id} -> ${key}`).toBe(q.room);
    }
  });

  it('uses every planted message as an answer', () => {
    const used = new Set(QUESTIONS.flatMap((q) => q.relevant));
    for (const m of PLANTED) expect(used.has(m.key), m.key).toBe(true);
  });

  it('keeps planted bodies unique and distinct from the near misses', () => {
    const bodies = PLANTED.map((m) => m.body);
    expect(new Set(bodies).size).toBe(bodies.length);
    const distractorBodies = new Set(DISTRACTORS.map((d) => d.body));
    for (const b of bodies) expect(distractorBodies.has(b), b).toBe(false);
  });
});

describe('generated corpus', () => {
  const corpus = buildCorpus();
  const all = Object.values(corpus).flat();
  const plantedBodies = new Set(PLANTED.map((m) => m.body));

  it('is deterministic, so results can be reproduced', () => {
    const again = Object.values(buildCorpus()).flat();
    expect(again.map((e) => e.body)).toEqual(all.map((e) => e.body));
  });

  it('never lets filler contain a term that anchors a planted answer', () => {
    // Otherwise a filler line could be an unlabelled correct answer.
    const leaks = all
      .filter((e) => e.kind === 'filler')
      .map((e) => [containsForbidden(e.body), e.body] as const)
      .filter(([term]) => term !== null);
    expect(leaks).toEqual([]);
  });

  it('keeps each planted answer as the only copy of its text', () => {
    for (const body of plantedBodies) {
      expect(all.filter((e) => e.body === body), body).toHaveLength(1);
    }
  });

  it('matches word-starts, not substrings, when screening filler', () => {
    expect(containsForbidden('the websocket reconnect bug')).toBeNull(); // not "ebs"
    expect(containsForbidden('deleting old ebs volumes')).toBe('ebs');
    expect(containsForbidden('filed for reimbursement')).toBe('reimburs');
  });

  it('is about 4,000 messages across the four rooms', () => {
    expect(all.length).toBeGreaterThan(4000);
    expect(all.length).toBeLessThan(4100);
  });
});

describe('question categories, checked with Postgres’s own stemmer', () => {
  // The keyword arm tokenises with to_tsvector('english', ...), so the claim
  // "shares no content words" has to be checked with the same tokeniser rather
  // than by eye. This is what keeps the paraphrase category honest.
  let pool: typeof import('../src/db/client.js')['pool'];
  const shared = new Map<string, string[]>();

  beforeAll(async () => {
    ({ pool } = await import('../src/db/client.js'));
    for (const q of QUESTIONS) {
      const answers = q.relevant.map((k) => planted.get(k)!.body).join(' ');
      const { rows } = await pool.query<{ lexeme: string }>(
        `SELECT unnest(tsvector_to_array(to_tsvector('english', $1)))
         INTERSECT
         SELECT unnest(tsvector_to_array(to_tsvector('english', $2))) AS lexeme`,
        [q.question, answers],
      );
      shared.set(q.id, rows.map((r) => Object.values(r)[0] as string));
    }
  });

  afterAll(async () => {
    // The shared pool is closed by the process; nothing to release here.
  });

  it('paraphrase questions share no stemmed word with their answer', () => {
    const offenders = QUESTIONS.filter((q) => q.category === 'paraphrase')
      .map((q) => [q.id, shared.get(q.id)!] as const)
      .filter(([, words]) => words.length > 0);
    expect(offenders).toEqual([]);
  });

  it('identifier and lexical questions do share words with their answer', () => {
    const offenders = QUESTIONS.filter((q) => q.category !== 'paraphrase')
      .map((q) => [q.id, shared.get(q.id)!] as const)
      .filter(([, words]) => words.length === 0);
    expect(offenders).toEqual([]);
  });
});
