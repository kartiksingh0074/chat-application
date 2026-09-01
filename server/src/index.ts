import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { allowedOrigins, env } from './config/env.js';
import { logger } from './logger.js';
import { authRouter } from './auth/routes.js';
import { roomsRouter } from './rooms/routes.js';
import { usersRouter } from './users/routes.js';
import { uploadsRouter } from './uploads/routes.js';
import { createSocketServer } from './socket/index.js';
import { registry } from './metrics/metrics.js';

const app = express();

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-correlation-id']?.toString() ?? randomUUID(),
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', nodeId: env.NODE_ID });
});

// Scraped per-instance (Prometheus hits node-1/node-2 directly, not through
// nginx) so each instance's series stay distinguishable by their nodeId label.
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

app.use('/auth', authRouter);
app.use('/rooms', roomsRouter);
app.use('/users', usersRouter);
app.use('/uploads', uploadsRouter);

const httpServer = http.createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server listening');
});
