import type { Redis } from 'ioredis';
import type { Message } from '@chat-application/shared';
import type { IoServer } from '../socket/index.js';
import { logger } from '../logger.js';

/**
 * How the RAG worker reaches sockets it does not own.
 *
 * The bot runs in a worker process, not the socket servers: 8.4 forbids the
 * socket path from calling an embedding model, and loading one into node-1 and
 * node-2 would cost ~270 MB each and block their event loops on CPU inference.
 * But the answer has to stream to sockets connected to those nodes.
 *
 * The worker publishes each event to one Redis channel; every node subscribes
 * and emits to *its own* sockets with `io.local`. Using `io.to` instead would
 * go back through the Redis adapter to every node - so with two nodes each
 * subscribed, every token would arrive twice.
 *
 * `@socket.io/redis-emitter` does this off the shelf, but it is a dependency
 * PROJECT.md 2 does not list (10 says to ask first), and plain pub/sub on the
 * ioredis client already in use is a few lines.
 */

export const BOT_RELAY_CHANNEL = 'bot:relay';

export type RelayEnvelope =
  | { event: 'bot:token'; roomId: string; data: { queryId: string; token: string } }
  | { event: 'bot:complete'; roomId: string; data: { queryId: string; messageId: string; citations: string[] } }
  | { event: 'bot:error'; roomId: string; data: { queryId: string; message: string } }
  | { event: 'message:new'; roomId: string; data: Message };

const RELAYED_EVENTS = new Set<RelayEnvelope['event']>(['bot:token', 'bot:complete', 'bot:error', 'message:new']);

/** Parse and check an envelope. Anything malformed is dropped, not emitted. */
export function parseEnvelope(raw: string): RelayEnvelope | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { event, roomId, data } = value as Record<string, unknown>;
  if (typeof event !== 'string' || !RELAYED_EVENTS.has(event as RelayEnvelope['event'])) return null;
  if (typeof roomId !== 'string' || roomId.length === 0) return null;
  if (typeof data !== 'object' || data === null) return null;
  return value as RelayEnvelope;
}

export async function publishToRoom(publisher: Redis, envelope: RelayEnvelope): Promise<void> {
  await publisher.publish(BOT_RELAY_CHANNEL, JSON.stringify(envelope));
}

/** Called once per socket server. `subscriber` must be a dedicated connection. */
export async function subscribeToRelay(io: IoServer, subscriber: Redis): Promise<void> {
  subscriber.on('message', (channel, raw) => {
    if (channel !== BOT_RELAY_CHANNEL) return;
    const envelope = parseEnvelope(raw);
    if (!envelope) {
      logger.warn('dropped a malformed bot relay message');
      return;
    }
    const room = io.local.to(envelope.roomId);
    // Spelled out per event so each payload is checked against its event type.
    switch (envelope.event) {
      case 'bot:token':
        room.emit('bot:token', envelope.data);
        break;
      case 'bot:complete':
        room.emit('bot:complete', envelope.data);
        break;
      case 'bot:error':
        room.emit('bot:error', envelope.data);
        break;
      case 'message:new':
        room.emit('message:new', envelope.data);
        break;
    }
  });
  await subscriber.subscribe(BOT_RELAY_CHANNEL);
}
