import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const PERSIST_QUEUE_NAME = 'persist-message';

export interface PersistMessageJob {
  id: string;
  roomId: string;
  senderId: string;
  body: string | null;
  attachmentKey: string | null;
  createdAt: string; // ISO
}

export const persistQueue = new Queue<PersistMessageJob>(PERSIST_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false, // keep failed jobs around for inspection
  },
});
