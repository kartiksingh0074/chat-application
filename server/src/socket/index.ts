import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ClientToServerEvents, ServerToClientEvents } from '@chat-application/shared';
import { env } from '../config/env.js';
import { verifyToken } from '../auth/jwt.js';
import { logger } from '../logger.js';
import { registerHandlers } from './handlers.js';
import { markOnline, markOffline } from '../presence/presence.js';

export interface SocketData {
  userId: string;
  username: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  // Without this, a broadcast from a socket on one node instance would
  // never reach sockets connected to a different instance - horizontal
  // scaling would silently only work for clients pinned to the same node.
  const pubClient = new Redis(env.REDIS_URL);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

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
    registerHandlers(socket);
    void markOnline(io, socket.data.userId);

    socket.on('disconnect', () => {
      logger.info({ userId: socket.data.userId, socketId: socket.id }, 'socket disconnected');
      void markOffline(io, socket.data.userId);
    });
  });

  return io;
}
