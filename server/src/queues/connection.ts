import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// BullMQ requires this for the blocking connections its Workers use.
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
