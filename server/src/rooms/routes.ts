import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { db } from '../db/client.js';
import { roomMembers, rooms, users } from '../db/schema.js';
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

roomsRouter.get('/:id/members', requireAuth, async (req: AuthedRequest, res) => {
  const roomId = req.params.id;
  if (typeof roomId !== 'string' || roomId.length === 0) {
    res.status(400).json({ code: 'invalid_room', message: 'Missing room id' });
    return;
  }

  const isMember = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, req.userId!)),
  });
  if (!isMember) {
    res.status(403).json({ code: 'not_a_member', message: 'You are not a member of this room' });
    return;
  }

  const members = await db
    .select({ id: users.id, username: users.username, joinedAt: roomMembers.joinedAt })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(eq(roomMembers.roomId, roomId));

  res.json({ members });
});

const createRoomSchema = z.object({
  name: z.string().min(1).max(80),
  memberIds: z.array(z.string().min(1)).max(100).default([]),
});

roomsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_payload', message: parsed.error.message });
    return;
  }
  const { name, memberIds } = parsed.data;

  // The creator is always a member; dedupe so a caller listing themselves
  // doesn't violate the composite primary key.
  const everyone = Array.from(new Set([req.userId!, ...memberIds]));
  const roomId = ulid();

  await db.transaction(async (tx) => {
    await tx.insert(rooms).values({ id: roomId, name, isDirect: false });
    await tx.insert(roomMembers).values(everyone.map((userId) => ({ roomId, userId })));
  });

  res.status(201).json({ room: { id: roomId, name, isDirect: false } });
});

const dmSchema = z.object({ userId: z.string().min(1) });

// Get-or-create the 1-to-1 room between the caller and another user, so
// opening a DM twice doesn't create two rooms.
roomsRouter.post('/dm', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = dmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_payload', message: parsed.error.message });
    return;
  }
  const otherId = parsed.data.userId;
  if (otherId === req.userId) {
    res.status(400).json({ code: 'invalid_target', message: 'Cannot DM yourself' });
    return;
  }

  const other = await db.query.users.findFirst({ where: eq(users.id, otherId) });
  if (!other) {
    res.status(404).json({ code: 'not_found', message: 'User not found' });
    return;
  }

  const mine = db
    .select({ roomId: roomMembers.roomId })
    .from(roomMembers)
    .where(eq(roomMembers.userId, req.userId!));
  const existing = await db
    .select({ id: rooms.id, name: rooms.name })
    .from(rooms)
    .innerJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
    .where(and(eq(rooms.isDirect, true), eq(roomMembers.userId, otherId), inArray(rooms.id, mine)))
    .limit(1);

  if (existing[0]) {
    res.json({ room: { ...existing[0], isDirect: true } });
    return;
  }

  const roomId = ulid();
  const name = `${req.username} & ${other.username}`;
  await db.transaction(async (tx) => {
    await tx.insert(rooms).values({ id: roomId, name, isDirect: true });
    await tx.insert(roomMembers).values([
      { roomId, userId: req.userId! },
      { roomId, userId: otherId },
    ]);
  });

  res.status(201).json({ room: { id: roomId, name, isDirect: true } });
});
