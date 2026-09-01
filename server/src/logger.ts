import pino from 'pino';
import { env } from './config/env.js';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { nodeId: env.NODE_ID },
});

export function childLogger(correlationId: string) {
  return logger.child({ correlationId });
}
