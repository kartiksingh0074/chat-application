import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@chat-application/shared';

const SERVER_URL = 'http://localhost:4000';

export function createSocket(token: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(SERVER_URL, {
    auth: { token },
  });
}
