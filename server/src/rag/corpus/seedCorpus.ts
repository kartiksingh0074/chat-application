import { eq, inArray } from 'drizzle-orm';
import { monotonicFactory } from 'ulidx';
import { db, pool } from '../../db/client.js';
import { messageEmbeddings, messages, roomBotConfig, roomMembers, rooms, users } from '../../db/schema.js';
import { hashPassword } from '../../auth/password.js';
import { logger } from '../../logger.js';
import { CORPUS_PEOPLE, CORPUS_ROOMS, type RoomKey } from './facts.js';
import { buildCorpus } from './filler.js';

/**
 * Seeds the 8.8 evaluation corpus: four rooms of realistic team chat with
 * planted answers and near misses.
 *
 *   npm run rag:seed -w server             seed (refuses if already seeded)
 *   npm run rag:seed -w server -- --reset  wipe the corpus rooms and reseed
 *
 * Room ids are fixed ("rag-incidents", ...) so reseeding and evaluation never
 * need to look anything up, and the load-test rooms are never touched.
 * Existing alice/bob accounts are added as members so the rooms are browsable
 * in the app.
 */

const DEMO_PASSWORD = 'password123';
const HISTORY_DAYS = 45;
const INSERT_BATCH = 500;

const roomIds = Object.values(CORPUS_ROOMS).map((r) => r.id);

async function reset(): Promise<void> {
  await db.delete(messageEmbeddings).where(inArray(messageEmbeddings.roomId, roomIds));
  await db.delete(messages).where(inArray(messages.roomId, roomIds));
  await db.delete(roomBotConfig).where(inArray(roomBotConfig.roomId, roomIds));
  await db.delete(roomMembers).where(inArray(roomMembers.roomId, roomIds));
  await db.delete(rooms).where(inArray(rooms.id, roomIds));
  logger.info('corpus rooms removed');
}

/** Corpus people are looked up by username, so an existing account is reused. */
async function ensurePeople(): Promise<Map<string, string>> {
  const idByName = new Map<string, string>();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const name of CORPUS_PEOPLE) {
    const existing = await db.query.users.findFirst({ where: eq(users.username, name) });
    if (existing) {
      idByName.set(name, existing.id);
      continue;
    }
    const id = `rag-user-${name}`;
    await db.insert(users).values({ id, username: name, passwordHash });
    idByName.set(name, id);
  }
  return idByName;
}

async function main() {
  const shouldReset = process.argv.includes('--reset');

  const already = await db
    .select({ id: messages.id })
    .from(messages)
    .where(inArray(messages.roomId, roomIds))
    .limit(1);

  if (already.length > 0 && !shouldReset) {
    logger.error('corpus is already seeded; pass --reset to wipe and reseed it');
    process.exitCode = 1;
    await pool.end();
    return;
  }
  if (shouldReset) await reset();

  const idByName = await ensurePeople();
  const demoAccounts = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.username, ['alice', 'bob']));

  await db.insert(rooms).values(
    Object.values(CORPUS_ROOMS).map((r) => ({ id: r.id, name: r.name, isDirect: false })),
  );
  await db.insert(roomBotConfig).values(roomIds.map((roomId) => ({ roomId, enabled: true, topK: 10 })));

  const memberIds = [...idByName.values(), ...demoAccounts.map((u) => u.id)];
  await db
    .insert(roomMembers)
    .values(roomIds.flatMap((roomId) => memberIds.map((userId) => ({ roomId, userId }))))
    .onConflictDoNothing();

  const corpus = buildCorpus();
  const nextId = monotonicFactory();
  const start = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const counts: Record<string, number> = { filler: 0, planted: 0, distractor: 0 };

  for (const [key, entries] of Object.entries(corpus) as [RoomKey, typeof corpus.eng][]) {
    const roomId = CORPUS_ROOMS[key].id;
    const step = (HISTORY_DAYS * 24 * 60 * 60 * 1000) / entries.length;

    // Timestamps rise strictly, and ids come from the same clock, so id order
    // and createdAt order agree - which is what cursor pagination relies on.
    const rows = entries.map((entry, i) => {
      counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
      const createdAt = new Date(Math.floor(start + i * step));
      return {
        id: nextId(createdAt.getTime()),
        roomId,
        senderId: idByName.get(entry.sender)!,
        body: entry.body,
        attachmentKey: null,
        createdAt,
      };
    });

    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      await db.insert(messages).values(rows.slice(i, i + INSERT_BATCH));
    }
    logger.info({ room: CORPUS_ROOMS[key].name, messages: rows.length }, 'room seeded');
  }

  logger.info(
    { rooms: roomIds.length, members: memberIds.length, ...counts },
    'corpus seeded',
  );
  await pool.end();
}

void main();
