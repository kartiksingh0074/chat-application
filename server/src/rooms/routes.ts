import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { roomMembers, rooms } from '../db/schema.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { buildMessagesPageQuery } from './messagesQuery.js';

export const roomsRouter = Router();

roomsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const memberRooms = await db
    .select({ id: rooms.id, name: rooms.name, isDirect: rooms.isDirect })
    .from(roomMembers)
    .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
    .where(eq(roomMembers.userId, req.userId!));

  res.json({ rooms: memberRooms });
});

const messagesQuerySchema = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

roomsRouter.get('/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  const roomId = req.params.id;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    res.status(400).json({ code: 'invalid_room', message: 'Missing room id' });
    return;
  }

  const parsed = messagesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_query', message: parsed.error.message });
    return;
  }
  const { before, limit } = parsed.data;

  const membership = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, req.userId!)),
  });
  if (!membership) {
    res.status(403).json({ code: 'not_a_member', message: 'You are not a member of this room' });
    return;
  }

  const page = await buildMessagesPageQuery(roomId, before, limit);
  page.reverse(); // DESC (newest-first, for the indexed cursor scan) -> ascending, for the client to prepend

  res.json({ messages: page, hasMore: page.length === limit });
});
