import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

export function childLogger(correlationId: string) {
  return logger.child({ correlationId });
}
