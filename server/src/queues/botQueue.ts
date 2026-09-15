import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const BOT_QUEUE_NAME = 'bot-query';

export interface BotQueryJob {
  queryId: string;
  roomId: string;
  /** The asker. Membership is re-checked in the worker, not trusted from here. */
  userId: string;
  question: string;
}

/**
 * Bot questions, answered by the RAG worker. The socket handler only enqueues:
 * embedding and generation never run on a socket server (8.4).
 */
export const botQueue = new Queue<BotQueryJob>(BOT_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    // Never retried. An answer streams to the room as it is generated, so a
    // retry after a partial failure would stream a second answer on top of the
    // first. A failure is reported to the room as bot:error instead.
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: 100,
  },
});
