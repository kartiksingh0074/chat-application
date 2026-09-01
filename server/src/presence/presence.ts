import { db } from '../db/client.js';
import { roomMembers } from '../db/schema.js';
import { presenceRedis } from './redis.js';
import type { IoServer } from '../socket/index.js';

const presenceKey = (userId: string) => `presence:${userId}`;

async function userRoomIds(userId: string): Promise<string[]> {
  const rows = await db.query.roomMembers.findMany({ where: (rm, { eq }) => eq(rm.userId, userId) });
  return rows.map((r) => r.roomId);
}

// Connection count per user in Redis, not process memory: a user can have
// multiple sockets (tabs, or reconnects) landing on different node
// instances, so "online" has to be a fact every instance can agree on.
export async function markOnline(io: IoServer, userId: string): Promise<void> {
  const count = await presenceRedis.incr(presenceKey(userId));
  if (count === 1) {
    const roomIds = await userRoomIds(userId);
    for (const roomId of roomIds) {
      io.to(roomId).emit('presence:update', { userId, online: true });
    }
  }
}

export async function markOffline(io: IoServer, userId: string): Promise<void> {
  const count = await presenceRedis.decr(presenceKey(userId));
  if (count <= 0) {
    if (count < 0) await presenceRedis.set(presenceKey(userId), 0);
    const roomIds = await userRoomIds(userId);
    for (const roomId of roomIds) {
      io.to(roomId).emit('presence:update', { userId, online: false });
    }
  }
}
