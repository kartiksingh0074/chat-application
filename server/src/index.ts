import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { allowedOrigins, env } from './config/env.js';
import { logger } from './logger.js';
import { authRouter } from './auth/routes.js';
import { roomsRouter } from './rooms/routes.js';
import { uploadsRouter } from './uploads/routes.js';
import { createSocketServer } from './socket/index.js';

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

app.use('/auth', authRouter);
app.use('/rooms', roomsRouter);
app.use('/uploads', uploadsRouter);

const httpServer = http.createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server listening');
});
