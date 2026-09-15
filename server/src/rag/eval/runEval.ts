import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool } from '../../db/client.js';
import { messageEmbeddings, messages, users } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { embedDocuments, embedQuery, warmUpEmbeddings } from '../embeddings.js';
import { isEmbeddable } from '../chunking.js';
import { retrieve, type KeywordMatch, type RetrievalMode, type VectorStrategy } from '../retrieval.js';
import { CORPUS_ROOMS, PLANTED, QUESTIONS, type QuestionCategory } from '../corpus/facts.js';
import { buildCorpus } from '../corpus/filler.js';
import { firstRelevantRank, mean, percentile, reciprocalRank, recallAtK } from './metrics.js';

/**
 * PROJECT.md 8.8: recall@10, MRR and p95 latency for keyword, vector and hybrid
 * retrieval over a labelled question set, plus embedding cost and index size.
 *
 *   npm run rag:seed -w server && npm run rag:backfill -w server -- --room ...
 *   npm run rag:eval -w server
 *
 * Three official modes, plus diagnostic variants that separate the
 * embedding model's quality from the index and query-parsing choices - see
 * VectorStrategy and KeywordMatch in retrieval.ts for why that mattered.
 */

const K = 10;
const REPS = 5;
const EMBED_SAMPLE = 1000;
const OUT_DIR = fileURLToPath(new URL('../../../../docs/rag-eval/', import.meta.url));

interface Config {
  name: string;
  mode: RetrievalMode;
  strategy: VectorStrategy;
  match: KeywordMatch;
  armLimit?: number;
  official: boolean;
}

const CONFIGS: Config[] = [
  { name: 'keyword', mode: 'keyword', strategy: 'iterative', match: 'all', official: true },
  { name: 'vector', mode: 'vector', strategy: 'iterative', match: 'all', official: true },
  { name: 'hybrid', mode: 'hybrid', strategy: 'iterative', match: 'all', official: true },
  { name: 'keyword, any word', mode: 'keyword', strategy: 'iterative', match: 'any', official: false },
  { name: 'hybrid, any-word keyword', mode: 'hybrid', strategy: 'iterative', match: 'any', official: false },
  // Fusion depth. Exploratory: chosen after seeing the 50-candidate result, on the
  // same 30 questions, so it shows a mechanism rather than a tuned setting.
  { name: 'hybrid, any-word, 20 per arm', mode: 'hybrid', strategy: 'iterative', match: 'any', armLimit: 20, official: false },
  { name: 'hybrid, any-word, 10 per arm', mode: 'hybrid', strategy: 'iterative', match: 'any', armLimit: 10, official: false },
  { name: 'vector, 8.5 index use as written', mode: 'vector', strategy: 'hnsw-default', match: 'all', official: false },
  { name: 'vector, exact search', mode: 'vector', strategy: 'exact', match: 'all', official: false },
];

interface QuestionResult {
  id: string;
  category: QuestionCategory;
  rank: number | null;
  recall: number;
  rr: number;
  returned: number;
}

async function resolveAnswerIds(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const fact of PLANTED) {
    const rows = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.roomId, CORPUS_ROOMS[fact.room].id), eq(messages.body, fact.body)));
    if (rows.length !== 1) {
      throw new Error(`planted fact ${fact.key} matched ${rows.length} messages; reseed the corpus`);
    }
    ids.set(fact.key, rows[0]!.id);
  }

  // A planted answer that was never embedded is invisible to the vector arm,
  // which would score as a retrieval failure when it is really a pipeline one.
  const embedded = await db
    .select({ id: messageEmbeddings.messageId })
    .from(messageEmbeddings)
    .where(inArray(messageEmbeddings.messageId, [...ids.values()]));
  if (embedded.length !== ids.size) {
    throw new Error(`${ids.size - embedded.length} planted answers are not embedded; run the backfill`);
  }
  return ids;
}

async function sharedLexemes(question: string, answers: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT unnest(tsvector_to_array(to_tsvector('english', $1)))
     INTERSECT
     SELECT unnest(tsvector_to_array(to_tsvector('english', $2)))`,
    [question, answers],
  );
  return rows.map((r) => Object.values(r)[0] as string).sort();
}

async function measureEmbeddingCost() {
  const bodies = Object.values(buildCorpus())
    .flat()
    .map((e) => e.body)
    .filter(isEmbeddable)
    .slice(0, EMBED_SAMPLE);

  const runOnce = async () => {
    const started = performance.now();
    for (let i = 0; i < bodies.length; i += env.EMBED_BATCH_SIZE) {
      await embedDocuments(bodies.slice(i, i + env.EMBED_BATCH_SIZE));
    }
    return performance.now() - started;
  };
  await runOnce(); // warm
  const ms = await runOnce();
  return {
    messages: bodies.length,
    batchSize: env.EMBED_BATCH_SIZE,
    msPer1k: Math.round((ms / bodies.length) * 1000),
    messagesPerSecond: Math.round(bodies.length / (ms / 1000)),
    costUsdPer1k: 0,
  };
}

async function indexSizes() {
  const { rows } = await pool.query<{ name: string; bytes: string }>(
    `SELECT name, pg_relation_size(name::regclass)::text AS bytes FROM (VALUES
       ('idx_embeddings_hnsw'), ('message_embeddings'), ('idx_embeddings_room'), ('idx_messages_tsv')
     ) AS t(name)`,
  );
  const { rows: countRows } = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM message_embeddings',
  );
  const embeddings = countRows[0]!.n;
  const bytes = Object.fromEntries(rows.map((r) => [r.name, Number(r.bytes)]));
  return {
    embeddings,
    hnswBytes: bytes['idx_embeddings_hnsw']!,
    tableBytes: bytes['message_embeddings']!,
    roomIndexBytes: bytes['idx_embeddings_room']!,
    hnswBytesPer1k: Math.round((bytes['idx_embeddings_hnsw']! / embeddings) * 1000),
    tableBytesPer1k: Math.round((bytes['message_embeddings']! / embeddings) * 1000),
    // The GIN index covers every message in the database, the 505k load-test
    // rows included, so it is reported but not comparable per embedding.
    ginBytesAllMessages: bytes['idx_messages_tsv']!,
  };
}

async function main() {
  const started = new Date();
  await warmUpEmbeddings();

  const evaluator = await db.query.users.findFirst({ where: eq(users.username, 'priya') });
  if (!evaluator) throw new Error('corpus user "priya" not found; run npm run rag:seed first');

  const answerIds = await resolveAnswerIds();
  const relevantFor = new Map(
    QUESTIONS.map((q) => [q.id, new Set(q.relevant.map((k) => answerIds.get(k)!))]),
  );

  const lexemes = new Map<string, string[]>();
  for (const q of QUESTIONS) {
    const answers = q.relevant.map((k) => PLANTED.find((p) => p.key === k)!.body).join(' ');
    lexemes.set(q.id, await sharedLexemes(q.question, answers));
  }

  const results: Record<string, unknown>[] = [];
  const perQuestion: Record<string, QuestionResult[]> = {};

  for (const config of CONFIGS) {
    const needsEmbedding = config.mode !== 'keyword';

    const runOne = async (question: (typeof QUESTIONS)[number]) => {
      const t0 = performance.now();
      const queryEmbedding = needsEmbedding ? await embedQuery(question.question) : undefined;
      const t1 = performance.now();
      const result = await retrieve({
        roomId: CORPUS_ROOMS[question.room].id,
        userId: evaluator.id,
        query: question.question,
        mode: config.mode,
        topK: K,
        queryEmbedding,
        vectorStrategy: config.strategy,
        keywordMatch: config.match,
        armLimit: config.armLimit,
      });
      const t2 = performance.now();
      return { ids: result.messages.map((m) => m.id), retrievalMs: t2 - t1, endToEndMs: t2 - t0 };
    };

    // Warm pass: connection pool, plan cache and model are hot before timing.
    for (const q of QUESTIONS) await runOne(q);

    const retrievalMs: number[] = [];
    const endToEndMs: number[] = [];
    const rows: QuestionResult[] = [];

    for (const q of QUESTIONS) {
      const relevant = relevantFor.get(q.id)!;
      for (let rep = 0; rep < REPS; rep += 1) {
        const run = await runOne(q);
        retrievalMs.push(run.retrievalMs);
        endToEndMs.push(run.endToEndMs);
        if (rep === 0) {
          rows.push({
            id: q.id,
            category: q.category,
            rank: firstRelevantRank(run.ids, relevant),
            recall: recallAtK(run.ids, relevant, K),
            rr: reciprocalRank(run.ids, relevant, K),
            returned: run.ids.length,
          });
        }
      }
    }

    const byCategory = Object.fromEntries(
      (['identifier', 'paraphrase', 'lexical'] as const).map((category) => {
        const subset = rows.filter((r) => r.category === category);
        return [
          category,
          {
            questions: subset.length,
            recallAt10: mean(subset.map((r) => r.recall)),
            mrr: mean(subset.map((r) => r.rr)),
          },
        ];
      }),
    );

    results.push({
      config: config.name,
      official: config.official,
      recallAt10: mean(rows.map((r) => r.recall)),
      mrr: mean(rows.map((r) => r.rr)),
      p50RetrievalMs: percentile(retrievalMs, 50),
      p95RetrievalMs: percentile(retrievalMs, 95),
      p95EndToEndMs: percentile(endToEndMs, 95),
      questionsWithNoResults: rows.filter((r) => r.returned === 0).length,
      byCategory,
    });
    perQuestion[config.name] = rows;
  }

  const report = {
    generatedAt: started.toISOString(),
    environment: {
      cpu: os.cpus()[0]?.model,
      logicalCores: os.cpus().length,
      ramGb: Math.round(os.totalmem() / 1024 ** 3),
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      embeddingModel: env.EMBED_MODEL,
      postgres: 'pgvector/pgvector:pg16 in Docker Desktop (WSL2)',
      note: 'Timings include the membership check and the host-to-WSL2 hop to Postgres.',
    },
    method: {
      questions: QUESTIONS.length,
      k: K,
      timedRepetitions: REPS,
      armCandidates: 50,
      rrfK: 60,
      armCandidatesNote: 'official modes use 50 per arm, as 8.5 specifies',
      relevance: 'strict: only planted answers count, so scores are a lower bound',
    },
    embeddingCost: await measureEmbeddingCost(),
    indexSize: await indexSizes(),
    results,
    perQuestion: QUESTIONS.map((q) => ({
      id: q.id,
      category: q.category,
      question: q.question,
      sharedLexemes: lexemes.get(q.id),
      ranks: Object.fromEntries(
        CONFIGS.map((c) => [c.name, perQuestion[c.name]!.find((r) => r.id === q.id)!.rank]),
      ),
    })),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  printReport(report);
  await pool.end();
}

function printReport(report: {
  results: Record<string, unknown>[];
  embeddingCost: Record<string, number>;
  indexSize: Record<string, number>;
  perQuestion: { id: string; category: string; sharedLexemes?: string[]; ranks: Record<string, number | null> }[];
}) {
  const pct = (v: unknown) => `${((v as number) * 100).toFixed(1)}%`;
  const ms = (v: unknown) => `${(v as number).toFixed(1)}`;

  console.log('\n| Mode | recall@10 | MRR | p50 ms | p95 ms | p95 end-to-end ms | no results |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of report.results) {
    console.log(
      `| ${r['config']} | ${pct(r['recallAt10'])} | ${(r['mrr'] as number).toFixed(3)} | ${ms(r['p50RetrievalMs'])} | ${ms(r['p95RetrievalMs'])} | ${ms(r['p95EndToEndMs'])} | ${r['questionsWithNoResults']} |`,
    );
  }

  console.log('\n| Mode | identifier R@10 / MRR | paraphrase R@10 / MRR | lexical R@10 / MRR |');
  console.log('|---|---|---|---|');
  for (const r of report.results) {
    const c = r['byCategory'] as Record<string, { recallAt10: number; mrr: number }>;
    const cell = (k: string) => `${pct(c[k]!.recallAt10)} / ${c[k]!.mrr.toFixed(3)}`;
    console.log(`| ${r['config']} | ${cell('identifier')} | ${cell('paraphrase')} | ${cell('lexical')} |`);
  }

  console.log('\nembedding cost:', report.embeddingCost);
  console.log('index size:', report.indexSize);

  console.log('\nper question, rank of first relevant message (- = not in top 10):');
  console.log('id   cat         kw  vec hyb | kwOR hybOR | shared lexemes');
  for (const q of report.perQuestion) {
    const r = (name: string) => {
      const v = q.ranks[name];
      return (v === null || v === undefined || v > K ? '-' : String(v)).padStart(3);
    };
    console.log(
      `${q.id}  ${q.category.padEnd(10)} ${r('keyword')} ${r('vector')} ${r('hybrid')} |  ${r('keyword, any word')}   ${r('hybrid, any-word keyword')}  | ${(q.sharedLexemes ?? []).join(', ')}`,
    );
  }
}

void main();
