import { db } from '../db/client.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { presenceRedis } from './redis.js';

/** Just what presence needs from Socket.IO, so tests can pass a stand-in. */
export interface PresenceBroadcaster {
  to(room: string): { emit(event: 'presence:update', payload: { userId: string; online: boolean }): unknown };
}

/**
 * Presence lives in Redis, not process memory: a user can have several sockets
 * (tabs, reconnects) on different node instances, so "online" has to be a fact
 * every instance agrees on.
 *
 * It is tracked as a *set of connections*, not a counter. A counter was
 * incremented on connect and decremented on disconnect, and a node that dies -
 * a crash, a deploy, `docker compose up --build` - never runs its disconnects.
 * Its counts leaked for good: after one rebuild a single open tab counted as 2,
 * so closing it left the user showing online forever. With a set, each entry
 * names the node that holds the socket, and a restarting node removes whatever
 * its previous run left behind.
 *
 *   online:<userId>      set of "<nodeId>|<socketId>" - one per live connection
 *   online-node:<nodeId> set of "<userId>|<socketId>" - what that node holds,
 *                        so it can clean up after itself without a SCAN
 */
const userKey = (userId: string) => `online:${userId}`;
const nodeKey = (nodeId: string) => `online-node:${nodeId}`;

async function userRoomIds(userId: string): Promise<string[]> {
  const rows = await db.query.roomMembers.findMany({ where: (rm, { eq }) => eq(rm.userId, userId) });
  return rows.map((r) => r.roomId);
}

async function broadcast(io: PresenceBroadcaster, userId: string, online: boolean): Promise<void> {
  for (const roomId of await userRoomIds(userId)) {
    io.to(roomId).emit('presence:update', { userId, online });
  }
}

export async function markOnline(
  io: PresenceBroadcaster,
  userId: string,
  socketId: string,
  nodeId: string = env.NODE_ID,
): Promise<void> {
  const results = await presenceRedis
    .multi()
    .sadd(userKey(userId), `${nodeId}|${socketId}`)
    .sadd(nodeKey(nodeId), `${userId}|${socketId}`)
    .scard(userKey(userId))
    .exec();
  // Announce only the first connection; a second tab changes nothing visible.
  if (Number(results?.[2]?.[1]) === 1) await broadcast(io, userId, true);
}

export async function markOffline(
  io: PresenceBroadcaster,
  userId: string,
  socketId: string,
  nodeId: string = env.NODE_ID,
): Promise<void> {
  const results = await presenceRedis
    .multi()
    .srem(userKey(userId), `${nodeId}|${socketId}`)
    .srem(nodeKey(nodeId), `${userId}|${socketId}`)
    .scard(userKey(userId))
    .exec();
  if (Number(results?.[2]?.[1]) === 0) await broadcast(io, userId, false);
}

/**
 * Forget the connections a previous run of this node left behind. Called at
 * startup, before the node accepts sockets.
 *
 * The node's index is renamed away first, atomically, so a socket that
 * connects while cleanup runs writes to a fresh index and is not swept up with
 * the stale ones.
 *
 * Limit: a node that never starts again (scaled down for good) leaves its
 * entries until a node with the same NODE_ID does.
 */
export async function clearStalePresence(io: PresenceBroadcaster, nodeId: string = env.NODE_ID): Promise<number> {
  const staleKey = `${nodeKey(nodeId)}:stale:${Date.now()}`;
  try {
    await presenceRedis.rename(nodeKey(nodeId), staleKey);
  } catch {
    return 0; // No index: nothing was left behind.
  }

  const entries = await presenceRedis.smembers(staleKey);
  for (const entry of entries) {
    const separator = entry.lastIndexOf('|');
    const userId = entry.slice(0, separator);
    const socketId = entry.slice(separator + 1);
    const results = await presenceRedis
      .multi()
      .srem(userKey(userId), `${nodeId}|${socketId}`)
      .scard(userKey(userId))
      .exec();
    // Other nodes' clients still think this user is here; tell them otherwise.
    if (Number(results?.[1]?.[1]) === 0) await broadcast(io, userId, false);
  }
  await presenceRedis.del(staleKey);

  if (entries.length > 0) logger.info({ nodeId, cleared: entries.length }, 'cleared stale presence');
  return entries.length;
}

/**
 * Who is online right now, for a set of users.
 *
 * Presence was only ever pushed as *changes*, so a client that loaded after
 * someone connected never learned they were online - and never received the
 * event for its own connection either, because it is sent before the client
 * has joined any room. Every member list therefore showed everyone offline,
 * including the viewer. Lists now carry this snapshot; live events keep it
 * current from there.
 */
export async function onlineUserIds(userIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Set();
  const pipeline = presenceRedis.pipeline();
  for (const id of unique) pipeline.scard(userKey(id));
  const results = (await pipeline.exec()) ?? [];
  return new Set(unique.filter((_, i) => Number(results[i]?.[1] ?? 0) > 0));
}
