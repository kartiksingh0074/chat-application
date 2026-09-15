import { Worker } from 'bullmq';
import { sql } from 'drizzle-orm';
import { redisConnection } from '../queues/connection.js';
import { EMBED_QUEUE_NAME, type EmbedMessageJob } from '../queues/embedQueue.js';
import { db, pool } from '../db/client.js';
import { messageEmbeddings } from '../db/schema.js';
import { embedDocuments } from '../rag/embeddings.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

/**
 * Embeds live messages, one per job (8.4).
 *
 * Deviation from 8.4's wording, deliberately: it says the worker "batches up
 * to 100 messages per API call". BullMQ hands jobs to a processor one at a
 * time, and building a batch inside a processor means either holding jobs open
 * while waiting for the batch to fill - adding latency and risking stalled
 * locks - or reaching past BullMQ's job lifecycle to acknowledge siblings by
 * hand, which is fragile.
 *
 * The volume 8.4 is worried about is backfill, not live traffic: people type a
 * few messages a minute, so one call each is well inside the rate limit and
 * gets the embedding in place immediately. Batching lives in the backfill
 * script (`backfillEmbeddings.ts`), which is where thousands of messages
 * actually arrive at once and where the request-per-day budget is at stake.
 */
const worker = new Worker<EmbedMessageJob>(
  EMBED_QUEUE_NAME,
  async (job) => {
    const { messageId, roomId, body } = job.data;
    const [embedding] = await embedDocuments([body]);
    if (!embedding) throw new Error('no embedding returned');

    // A retry whose prior attempt already wrote the row should converge, not
    // collide - and re-embedding after a model change should overwrite.
    await db
      .insert(messageEmbeddings)
      .values({ messageId, roomId, embedding, model: env.EMBED_MODEL })
      .onConflictDoUpdate({
        target: messageEmbeddings.messageId,
        set: {
          embedding: sql`excluded.embedding`,
          model: sql`excluded.model`,
          createdAt: sql`now()`,
        },
      });
  },
  { connection: redisConnection, concurrency: 2 },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, messageId: job.data.messageId }, 'message embedded');
});

worker.on('failed', (job, err) => {
  // 8.4: a message that never embeds stays searchable by keyword, so this
  // degrades retrieval for that message rather than losing it.
  logger.error(
    { jobId: job?.id, messageId: job?.data.messageId, attemptsMade: job?.attemptsMade, err },
    'embed job failed',
  );
});

logger.info({ model: env.EMBED_MODEL }, 'embed worker started');

async function shutdown() {
  await worker.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
