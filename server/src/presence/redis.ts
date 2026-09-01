import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// A dedicated connection for presence commands, separate from the
// pub/sub connections the Socket.IO adapter owns and from BullMQ's.
export const presenceRedis = new Redis(env.REDIS_URL);
