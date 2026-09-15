import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ClientToServerEvents, ServerToClientEvents } from '@chat-application/shared';
import { allowedOrigins, env } from '../config/env.js';
import { verifyToken } from '../auth/jwt.js';
import { logger } from '../logger.js';
import { registerHandlers } from './handlers.js';
import { clearStalePresence, markOnline, markOffline } from '../presence/presence.js';
import { activeSockets, wsReconnectionsTotal } from '../metrics/metrics.js';
import { subscribeToRelay } from '../bot/relay.js';

export interface SocketData {
  userId: string;
  username: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: allowedOrigins },
    // Browsers do NOT apply the same-origin policy to WebSocket upgrades -
    // any site can open a WS to us and the browser will send the user's
    // cookies with it. The JWT living in handshake.auth (never a cookie) is
    // the primary CSWSH defense; checking Origin here rejects such a
    // connection outright, before a socket is even created.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, typeof origin === 'string' && allowedOrigins.includes(origin));
    },
  });

  // Without this, a broadcast from a socket on one node instance would
  // never reach sockets connected to a different instance - horizontal
  // scaling would silently only work for clients pinned to the same node.
  const pubClient = new Redis(env.REDIS_URL);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Bot answers are generated in the RAG worker and relayed through Redis;
  // this node delivers them to its own sockets (see bot/relay.ts). A connection
  // in subscriber mode cannot run other commands, so it gets its own.
  subscribeToRelay(io, pubClient.duplicate()).catch((err) =>
    logger.error({ err }, 'could not subscribe to the bot relay; bot answers will not be delivered'),
  );

  // The handshake's IncomingMessage is retained for the life of the socket
  // otherwise, pinning its headers and buffers per connection. handshake.auth
  // and handshake.headers are already snapshotted, so this is safe to drop.
  io.engine.on('connection', (rawSocket: { request?: unknown }) => {
    rawSocket.request = null;
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

  // Before accepting sockets: forget connections a previous run of this node
  // held but never got to disconnect (a crash, a deploy). The Redis command is
  // issued synchronously here, ahead of any connection's own presence writes,
  // so fresh sockets are never swept up with the stale ones.
  clearStalePresence(io).catch((err) => logger.error({ err }, 'could not clear stale presence'));

  io.on('connection', (socket) => {
    logger.info({ userId: socket.data.userId, socketId: socket.id }, 'socket connected');
    activeSockets.inc();
    if (socket.handshake.auth['reconnect'] === true) {
      wsReconnectionsTotal.inc();
    }
    registerHandlers(socket);
    void markOnline(io, socket.data.userId, socket.id);

    socket.on('disconnect', () => {
      logger.info({ userId: socket.data.userId, socketId: socket.id }, 'socket disconnected');
      activeSockets.dec();
      void markOffline(io, socket.data.userId, socket.id);
    });
  });

  return io;
}
