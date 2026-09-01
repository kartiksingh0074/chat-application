import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@chat-application/shared';
import { API_BASE_URL } from '../config.js';

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
    // WebSocket-only: nginx's `least_conn` balances at connection time with
    // no sticky-session config, so Socket.IO's HTTP long-polling handshake
    // (separate requests that could land on different nodes) would break.
    // A single persistent WS connection naturally stays pinned to one node.
    socket = io(API_BASE_URL, { auth: { token }, transports: ['websocket'] });

    // Lets the server distinguish a reconnect from a fresh connect, which is
    // what ws_reconnections_total counts.
    socket.io.on('reconnect_attempt', () => {
      if (socket) socket.auth = { token, reconnect: true };
    });
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
