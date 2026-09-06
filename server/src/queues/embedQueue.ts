import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const EMBED_QUEUE_NAME = 'embed-message';

export interface EmbedMessageJob {
  messageId: string;
  roomId: string;
  body: string;
}

/**
 * Embedding is enqueued by the persist worker, never by the socket handler.
 * 8.4 is explicit: the socket path never calls an embedding API.
 *
 * Failures retry with exponential backoff, and a permanently failed message
 * stays searchable by the keyword arm - so losing an embedding degrades
 * retrieval rather than removing the message from results entirely.
 */
export const embedQueue = new Queue<EmbedMessageJob>(EMBED_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
