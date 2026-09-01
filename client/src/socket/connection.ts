import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@chat-application/shared';

const SERVER_URL = 'http://localhost:4000';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;
let subscriberCount = 0;
let pendingTeardown: ReturnType<typeof setTimeout> | null = null;

/**
 * One socket connection for the whole app: subsequent callers reuse it and
 * bump a reference count. Teardown on release is deferred a tick so React 18
 * StrictMode's dev-only mount->unmount->mount doesn't tear the connection
 * down and immediately reconnect it.
 */
export function acquireSocket(token: string): AppSocket {
  if (pendingTeardown) {
    clearTimeout(pendingTeardown);
    pendingTeardown = null;
  }
  if (!socket) {
    socket = io(SERVER_URL, { auth: { token } });
  }
  subscriberCount += 1;
  return socket;
}

export function releaseSocket(): void {
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0 && !pendingTeardown) {
    pendingTeardown = setTimeout(() => {
      pendingTeardown = null;
      if (subscriberCount === 0 && socket) {
        socket.disconnect();
        socket = null;
      }
    }, 0);
  }
}

if (import.meta.hot) {
  // On a real HMR replacement of this module, drop the old connection
  // entirely rather than leaving it alive alongside a fresh one.
  import.meta.hot.dispose(() => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    subscriberCount = 0;
    if (pendingTeardown) {
      clearTimeout(pendingTeardown);
      pendingTeardown = null;
    }
  });
}
