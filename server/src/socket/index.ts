import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@chat-application/shared';
import { env } from '../config/env.js';
import { verifyToken } from '../auth/jwt.js';
import { logger } from '../logger.js';
import { registerHandlers } from './handlers.js';

export interface SocketData {
  userId: string;
  username: string;
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth['token'];
    if (typeof token !== 'string') {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.info({ userId: socket.data.userId, socketId: socket.id }, 'socket connected');
    registerHandlers(io, socket);
    socket.on('disconnect', () => {
      logger.info({ userId: socket.data.userId, socketId: socket.id }, 'socket disconnected');
    });
  });

  return io;
}
