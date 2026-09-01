import { monotonicFactory } from 'ulidx';
import { db, pool } from './db/client.js';
import { messages } from './db/schema.js';
import { logger } from './logger.js';

const TOTAL = Number(process.argv[2] ?? 500_000);
const BATCH_SIZE = 1000;
const SPAN_MS = 30 * 24 * 60 * 60 * 1000; // spread across the last 30 days

const nextUlid = monotonicFactory();

async function main() {
  const room = await db.query.rooms.findFirst({ where: (r, { eq }) => eq(r.name, 'general') });
  if (!room) throw new Error('room "general" not found - run `npm run seed` first');

  const members = await db.query.roomMembers.findMany({ where: (rm, { eq }) => eq(rm.roomId, room.id) });
  if (members.length === 0) throw new Error('room "general" has no members - run `npm run seed` first');
  const senderIds = members.map((m) => m.userId);

  const startMs = Date.now() - SPAN_MS;
  const stepMs = SPAN_MS / TOTAL;

  logger.info({ total: TOTAL, batchSize: BATCH_SIZE }, 'bulk seeding messages');

  for (let batchStart = 0; batchStart < TOTAL; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL);
    const rows = [];
    for (let i = batchStart; i < batchEnd; i++) {
      const createdAt = new Date(startMs + i * stepMs);
      rows.push({
        id: nextUlid(createdAt.getTime()),
        roomId: room.id,
        senderId: senderIds[i % senderIds.length]!,
        body: `Seed message #${i} for load testing scrollback and pagination.`,
        attachmentKey: null,
        createdAt,
      });
    }
    await db.insert(messages).values(rows);
    if (batchStart % (BATCH_SIZE * 50) === 0) {
      logger.info({ inserted: batchEnd }, 'progress');
    }
  }

  logger.info({ total: TOTAL, roomId: room.id }, 'bulk seed complete');
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'bulk seed failed');
  process.exit(1);
});
