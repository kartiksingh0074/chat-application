import { Worker } from 'bullmq';
import { redisConnection } from '../queues/connection.js';
import { PERSIST_QUEUE_NAME, type PersistMessageJob } from '../queues/persistQueue.js';
import { embedQueue } from '../queues/embedQueue.js';
import { isEmbeddable } from '../rag/embeddings.js';
import { db, pool } from '../db/client.js';
import { messages } from '../db/schema.js';
import { logger } from '../logger.js';

const worker = new Worker<PersistMessageJob>(
  PERSIST_QUEUE_NAME,
  async (job) => {
    const { id, roomId, senderId, body, attachmentKey, createdAt } = job.data;
    // onConflictDoNothing: a retried job whose insert already committed
    // before a prior attempt failed downstream should not error out.
    await db
      .insert(messages)
      .values({ id, roomId, senderId, body, attachmentKey, createdAt: new Date(createdAt) })
      .onConflictDoNothing();

    // 8.4: the message is enqueued for embedding only after it is durable, and
    // only from here - the socket handler never touches an embedding API.
    // Short messages are skipped per 8.3; they carry nothing retrievable.
    if (isEmbeddable(body)) {
      await embedQueue.add('embed', { messageId: id, roomId, body });
    }
  },
  { connection: redisConnection, concurrency: 5 },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, messageId: job.data.id }, 'message persisted');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, messageId: job?.data.id, attemptsMade: job?.attemptsMade, err }, 'persist job failed');
});

logger.info('persist worker started');

async function shutdown() {
  await worker.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
