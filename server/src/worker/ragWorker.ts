import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db, pool } from '../db/client.js';
import { messageEmbeddings } from '../db/schema.js';
import { logger } from '../logger.js';
import { EMBED_QUEUE_NAME, type EmbedMessageJob } from '../queues/embedQueue.js';
import { BOT_QUEUE_NAME, type BotQueryJob } from '../queues/botQueue.js';
import { embedDocuments, warmUpEmbeddings } from '../rag/embeddings.js';
import { answerQuery } from '../bot/answerQuery.js';

/**
 * The RAG worker: embeds new messages (8.4) and answers @bot questions (8.6).
 *
 * One process for both so the embedding model is loaded once, not twice. It
 * runs outside the socket servers - they only enqueue - and outside Docker by
 * default (`npm run rag:worker -w server`), which keeps the ~270 MB model out of
 * the WSL2 memory allocation.
 *
 * Live embedding is one message per job, deliberately; see the Phase 8 part 1
 * entry in docs/decisions.md for why batching lives in the backfill instead.
 */

// BullMQ workers hold blocking connections, so each gets its own; the relay
// publisher and embedding cache share a separate, ordinary one.
const workerConnection = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const redis = new Redis(env.REDIS_URL);

async function embedOne(job: EmbedMessageJob): Promise<void> {
  const [embedding] = await embedDocuments([job.body]);
  if (!embedding) throw new Error('no embedding returned');

  // A retry after a partial write converges instead of colliding, and
  // re-embedding after a model change overwrites.
  await db
    .insert(messageEmbeddings)
    .values({ messageId: job.messageId, roomId: job.roomId, embedding, model: env.EMBED_MODEL })
    .onConflictDoUpdate({
      target: messageEmbeddings.messageId,
      set: { embedding: sql`excluded.embedding`, model: sql`excluded.model`, createdAt: sql`now()` },
    });
}

async function main() {
  // Load the model before taking jobs, so the first question is not the one
  // that waits for it.
  await warmUpEmbeddings();

  const embedWorker = new Worker<EmbedMessageJob>(EMBED_QUEUE_NAME, (job) => embedOne(job.data), {
    connection: workerConnection(),
    concurrency: 2,
  });

  const botWorker = new Worker<BotQueryJob>(BOT_QUEUE_NAME, (job) => answerQuery(job.data, redis), {
    connection: workerConnection(),
    // Groq's free tier allows 30 requests a minute; two answers at a time keeps
    // well inside that while one slow answer does not block the next.
    concurrency: 2,
  });

  embedWorker.on('failed', (job, err) => {
    // 8.4: a message that never embeds stays searchable by keyword.
    logger.error({ messageId: job?.data.messageId, attemptsMade: job?.attemptsMade, err }, 'embed job failed');
  });
  botWorker.on('failed', (job, err) => {
    // answerQuery reports its own failures to the room; this is only reached
    // for something that escaped it.
    logger.error({ queryId: job?.data.queryId, err }, 'bot job failed');
  });

  logger.info(
    { embedModel: env.EMBED_MODEL, chatModel: env.GROQ_CHAT_MODEL, generation: Boolean(env.GROQ_API_KEY) },
    'rag worker started',
  );

  const shutdown = async () => {
    await Promise.all([embedWorker.close(), botWorker.close()]);
    redis.disconnect();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main();
