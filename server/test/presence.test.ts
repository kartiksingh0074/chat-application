import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulidx';

/**
 * Presence against real Redis. The failure this guards against: a node that
 * dies never runs its disconnect handlers, and a counter-based design leaked a
 * count per lost socket - one browser tab showed as 2 connections after a
 * rebuild, so closing it left the user "online" forever.
 */

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://chatapp:chatapp@localhost:5433/chatapp';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.CORS_ORIGIN ??= 'http://localhost:5173';
});

type Presence = typeof import('../src/presence/presence.js');
let presence: Presence;
let redis: typeof import('../src/presence/redis.js')['presenceRedis'];

// Room ids are looked up in Postgres; a user in no rooms broadcasts nowhere,
// which is all these tests need. Emits are recorded anyway.
const emitted: { userId: string; online: boolean }[] = [];
const io = { to: () => ({ emit: (_e: string, p: { userId: string; online: boolean }) => emitted.push(p) }) };

const user = `test-presence-${ulid()}`;
const nodeA = `test-node-a-${ulid()}`;
const nodeB = `test-node-b-${ulid()}`;

beforeAll(async () => {
  presence = await import('../src/presence/presence.js');
  ({ presenceRedis: redis } = await import('../src/presence/redis.js'));
});

afterAll(async () => {
  await redis?.del(`online:${user}`, `online-node:${nodeA}`, `online-node:${nodeB}`);
});

const isOnline = async () => (await presence.onlineUserIds([user])).has(user);

describe('presence', () => {
  it('is online while any connection is open, and offline after the last one closes', async () => {
    await presence.markOnline(io, user, 's1', nodeA);
    await presence.markOnline(io, user, 's2', nodeB); // a second tab, on the other node
    expect(await isOnline()).toBe(true);

    await presence.markOffline(io, user, 's1', nodeA);
    expect(await isOnline()).toBe(true);

    await presence.markOffline(io, user, 's2', nodeB);
    expect(await isOnline()).toBe(false);
  });

  it('recovers when a node dies without running its disconnects', async () => {
    // The tab is connected to node A...
    await presence.markOnline(io, user, 'old-socket', nodeA);
    // ...node A is killed, so markOffline never runs, and the browser
    // reconnects to node B.
    await presence.markOnline(io, user, 'new-socket', nodeB);

    // Node A comes back up and clears what its previous run held.
    const cleared = await presence.clearStalePresence(io, nodeA);
    expect(cleared).toBe(1);
    expect(await isOnline()).toBe(true); // the live tab on node B still counts

    // Closing that tab now really takes the user offline.
    await presence.markOffline(io, user, 'new-socket', nodeB);
    expect(await isOnline()).toBe(false);
  });

  it('does not sweep up a socket that connects after cleanup begins', async () => {
    await presence.markOnline(io, user, 'stale', nodeA);
    const cleanup = presence.clearStalePresence(io, nodeA);
    // Issued after cleanup's first command, as a connection would be at startup.
    await presence.markOnline(io, user, 'fresh', nodeA);
    await cleanup;

    expect(await isOnline()).toBe(true);
    await presence.markOffline(io, user, 'fresh', nodeA);
    expect(await isOnline()).toBe(false);
  });

  it('is a no-op for a node with nothing left behind', async () => {
    expect(await presence.clearStalePresence(io, `never-started-${ulid()}`)).toBe(0);
  });

  it('reports users with no connections as offline', async () => {
    const ids = await presence.onlineUserIds([`nobody-${ulid()}`, user]);
    expect(ids.size).toBe(0);
  });
});
