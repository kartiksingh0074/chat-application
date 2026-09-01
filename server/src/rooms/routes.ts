import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { roomMembers, rooms } from '../db/schema.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';

export const roomsRouter = Router();

roomsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const memberRooms = await db
    .select({ id: rooms.id, name: rooms.name, isDirect: rooms.isDirect })
    .from(roomMembers)
    .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
    .where(eq(roomMembers.userId, req.userId!));

  res.json({ rooms: memberRooms });
});
