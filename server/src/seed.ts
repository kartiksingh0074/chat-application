import { ulid } from 'ulidx';
import { db, pool } from './db/client.js';
import { rooms, roomMembers, users } from './db/schema.js';
import { hashPassword } from './auth/password.js';
import { logger } from './logger.js';

const DEMO_PASSWORD = 'password123';

async function upsertUser(username: string) {
  const existing = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.username, username) });
  if (existing) return existing;
  const id = ulid();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db.insert(users).values({ id, username, passwordHash });
  return { id, username, passwordHash, createdAt: new Date() };
}

async function main() {
  const alice = await upsertUser('alice');
  const bob = await upsertUser('bob');

  let room = await db.query.rooms.findFirst({ where: (r, { eq }) => eq(r.name, 'general') });
  if (!room) {
    const id = ulid();
    await db.insert(rooms).values({ id, name: 'general', isDirect: false });
    room = { id, name: 'general', isDirect: false, createdAt: new Date() };
  }

  for (const user of [alice, bob]) {
    const existingMembership = await db.query.roomMembers.findFirst({
      where: (rm, { and, eq }) => and(eq(rm.roomId, room!.id), eq(rm.userId, user.id)),
    });
    if (!existingMembership) {
      await db.insert(roomMembers).values({ roomId: room.id, userId: user.id });
    }
  }

  logger.info(
    { roomId: room.id, users: ['alice', 'bob'], password: DEMO_PASSWORD },
    'seed complete: alice and bob are members of "general"',
  );
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
