import type { Socket } from 'socket.io';
import { z } from 'zod';
import { ulid } from 'ulidx';
import { and, eq } from 'drizzle-orm';
import type { ClientToServerEvents, ServerToClientEvents } from '@chat-application/shared';
import { db } from '../db/client.js';
import { messages, roomMembers } from '../db/schema.js';
import { logger } from '../logger.js';
import type { SocketData } from './index.js';

type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const roomJoinSchema = z.object({ roomId: z.string().min(1) });
const roomLeaveSchema = z.object({ roomId: z.string().min(1) });
const messageSendSchema = z.object({
  roomId: z.string().min(1),
  tempId: z.string().min(1),
  body: z.string().min(1).max(4000).optional(),
  attachmentKey: z.string().min(1).optional(),
});

async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  const membership = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)),
  });
  return membership !== undefined;
}

export function registerHandlers(socket: IoSocket) {
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
    await socket.leave(parsed.data.roomId);
  });

  socket.on('message:send', async (payload) => {
    const parsed = messageSendSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'invalid_payload', message: parsed.error.message });
      return;
    }
    const { roomId, tempId, body, attachmentKey } = parsed.data;

    if (!(await isRoomMember(roomId, socket.data.userId))) {
      socket.emit('error', { code: 'not_a_member', message: 'You are not a member of this room' });
      return;
    }

    const id = ulid();
    const createdAt = new Date();

    try {
      await db.insert(messages).values({
        id,
        roomId,
        senderId: socket.data.userId,
        body: body ?? null,
        attachmentKey: attachmentKey ?? null,
        createdAt,
      });
    } catch (err) {
      logger.error({ err, roomId, senderId: socket.data.userId }, 'failed to persist message');
      socket.emit('error', { code: 'send_failed', message: 'Message could not be sent' });
      return;
    }

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
  });
}
