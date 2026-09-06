import type { Socket } from 'socket.io';
import { z } from 'zod';
import { ulid } from 'ulidx';
import { and, eq } from 'drizzle-orm';
import {
  MAX_MESSAGE_LENGTH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@chat-application/shared';
import { db } from '../db/client.js';
import { messages, roomMembers } from '../db/schema.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { persistQueue } from '../queues/persistQueue.js';
import { messagesReceivedTotal, messagesRejectedTotal } from '../metrics/metrics.js';
import type { SocketData } from './index.js';

type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const roomJoinSchema = z.object({ roomId: z.string().min(1) });
const roomLeaveSchema = z.object({ roomId: z.string().min(1) });
const typingSchema = z.object({ roomId: z.string().min(1) });
const messageSendSchema = z
  .object({
    roomId: z.string().min(1),
    tempId: z.string().min(1),
    body: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    attachmentKey: z.string().min(1).optional(),
  })
  .refine((p) => p.body !== undefined || p.attachmentKey !== undefined, {
    message: 'a message needs a body, an attachment, or both',
  });

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 20;
// Typing fires far more often than sending, and costs a broadcast each time,
// so it gets its own budget rather than eating the message allowance.
const RATE_LIMIT_MAX_TYPING = 40;

async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  const membership = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)),
  });
  return membership !== undefined;
}

export function registerHandlers(socket: IoSocket) {
  // Per-socket, so this is connection-local by definition and needs no
  // Redis round-trip - a socket only ever exists on one node instance.
  let windowStartedAt = Date.now();
  let sentInWindow = 0;

  function withinRateLimit(): boolean {
    const now = Date.now();
    if (now - windowStartedAt > RATE_LIMIT_WINDOW_MS) {
      windowStartedAt = now;
      sentInWindow = 0;
    }
    sentInWindow += 1;
    return sentInWindow <= RATE_LIMIT_MAX_MESSAGES;
  }

  let typingWindowStartedAt = Date.now();
  let typingInWindow = 0;

  function withinTypingRateLimit(): boolean {
    const now = Date.now();
    if (now - typingWindowStartedAt > RATE_LIMIT_WINDOW_MS) {
      typingWindowStartedAt = now;
      typingInWindow = 0;
    }
    typingInWindow += 1;
    return typingInWindow <= RATE_LIMIT_MAX_TYPING;
  }

  /**
   * Typing is high-frequency, so it must not hit Postgres. `room:join`
   * already verified membership before joining, and a socket is only ever in
   * rooms it joined - so the room set is an authoritative membership check
   * that costs nothing.
   */
  function relayTyping(payload: unknown, typing: boolean) {
    if (!withinTypingRateLimit()) return;

    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;

    const { roomId } = parsed.data;
    if (!socket.rooms.has(roomId)) return;

    // socket.to, not io.to: you never need to be told that you are typing.
    socket.to(roomId).emit('typing:update', {
      roomId,
      userId: socket.data.userId,
      username: socket.data.username,
      typing,
    });
  }

  socket.on('room:join', async (payload) => {
    const parsed = roomJoinSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'invalid_payload', message: parsed.error.message });
      return;
    }
    const { roomId } = parsed.data;
    if (!(await isRoomMember(roomId, socket.data.userId))) {
      socket.emit('error', { code: 'not_a_member', message: 'You are not a member of this room' });
      return;
    }
    await socket.join(roomId);
  });

  socket.on('room:leave', async (payload) => {
    const parsed = roomLeaveSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'invalid_payload', message: parsed.error.message });
      return;
    }
    const { roomId } = parsed.data;
    if (socket.rooms.has(roomId)) {
      socket.to(roomId).emit('typing:update', {
        roomId,
        userId: socket.data.userId,
        username: socket.data.username,
        typing: false,
      });
    }
    await socket.leave(roomId);
  });

  socket.on('typing:start', (payload) => relayTyping(payload, true));
  socket.on('typing:stop', (payload) => relayTyping(payload, false));

  socket.on('message:send', async (payload) => {
    if (!withinRateLimit()) {
      messagesRejectedTotal.inc({ reason: 'rate_limited' });
      socket.emit('error', { code: 'rate_limited', message: 'Too many messages, slow down' });
      return;
    }

    const parsed = messageSendSchema.safeParse(payload);
    if (!parsed.success) {
      messagesRejectedTotal.inc({ reason: 'invalid_payload' });
      socket.emit('error', { code: 'invalid_payload', message: parsed.error.message });
      return;
    }
    const { roomId, tempId, body, attachmentKey } = parsed.data;

    if (!(await isRoomMember(roomId, socket.data.userId))) {
      messagesRejectedTotal.inc({ reason: 'not_a_member' });
      socket.emit('error', { code: 'not_a_member', message: 'You are not a member of this room' });
      return;
    }

    messagesReceivedTotal.inc();

    // Validate -> assign ID -> broadcast -> ack -> enqueue. The socket
    // process never writes to Postgres on the hot path; a worker persists
    // the message asynchronously (see server/src/worker/persistWorker.ts).
    const id = ulid();
    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();

    socket.to(roomId).emit('message:new', {
      id,
      roomId,
      senderId: socket.data.userId,
      body: body ?? null,
      attachmentKey: attachmentKey ?? null,
      createdAt: createdAtIso,
    });

    socket.emit('message:ack', { tempId, id, createdAt: createdAtIso });

    const row = {
      id,
      roomId,
      senderId: socket.data.userId,
      body: body ?? null,
      attachmentKey: attachmentKey ?? null,
    };

    try {
      if (env.PERSIST_MODE === 'sync') {
        // Phase 1's code path, kept only so experiment 2 can measure the
        // event loop cost of writing to Postgres on the hot path.
        await db.insert(messages).values({ ...row, createdAt });
      } else {
        await persistQueue.add('persist', { ...row, createdAt: createdAtIso });
      }
    } catch (err) {
      // The client already got its ack; this is a best-effort log only,
      // there is no in-flight request left to fail back to the sender.
      logger.error({ err, roomId, messageId: id }, 'failed to persist message');
    }
  });
}
