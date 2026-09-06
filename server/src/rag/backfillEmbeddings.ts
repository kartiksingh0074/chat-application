import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { messageEmbeddings, messages } from '../db/schema.js';
import { embedDocuments, isEmbeddable, MIN_EMBEDDABLE_LENGTH } from './embeddings.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

/**
 * One-off backfill for history that predates the embed worker (8.4).
 *
 * This is where batching earns its keep: the free tier is metered by requests
 * per day as well as tokens, so one call per message would burn the daily
 * budget on a few hundred messages. At 100 per call, a few thousand messages
 * cost a few dozen requests.
 *
 * Deliberately scoped by room. The 505k seeded messages are all the same
 * sentence with a counter - embedding them would cost roughly 8M tokens to
 * produce half a million near-identical vectors, which measures nothing in
 * 8.8. Pass the rooms that hold real conversation.
 *
 *   npm run rag:backfill -w server -- --room <roomId> [--room <roomId>] [--limit N]
 *   npm run rag:backfill -w server -- --all-except-seeded
 */

interface Options {
  roomIds: string[];
  limit: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const roomIds: string[] = [];
  let limit = Number.POSITIVE_INFINITY;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--room' && argv[i + 1]) {
      roomIds.push(argv[i + 1]!);
      i += 1;
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      limit = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { roomIds, limit, dryRun };
}

/** Messages in a room that have no embedding yet, oldest first. */
async function findUnembedded(roomId: string, after: string, batchSize: number) {
  return db
    .select({ id: messages.id, roomId: messages.roomId, body: messages.body })
    .from(messages)
    .leftJoin(messageEmbeddings, eq(messageEmbeddings.messageId, messages.id))
    .where(
      and(
        eq(messages.roomId, roomId),
        gt(messages.id, after),
        isNull(messageEmbeddings.messageId),
        sql`length(trim(coalesce(${messages.body}, ''))) >= ${MIN_EMBEDDABLE_LENGTH}`,
      ),
    )
    .orderBy(asc(messages.id))
    .limit(batchSize);
}

async function backfillRoom(roomId: string, options: Options): Promise<number> {
  const batchSize = env.EMBED_BATCH_SIZE;
  let cursor = '';
  let embedded = 0;

  for (;;) {
    if (embedded >= options.limit) break;

    const batch = await findUnembedded(roomId, cursor, batchSize);
    if (batch.length === 0) break;

    const usable = batch.filter((m) => isEmbeddable(m.body));
    cursor = batch[batch.length - 1]!.id;

    if (usable.length === 0) continue;

    if (options.dryRun) {
      embedded += usable.length;
      logger.info({ roomId, wouldEmbed: usable.length, cursor }, 'dry run batch');
      continue;
    }

    const vectors = await embedDocuments(usable.map((m) => m.body!));

    await db
      .insert(messageEmbeddings)
      .values(
        usable.map((m, i) => ({
          messageId: m.id,
          roomId: m.roomId,
          embedding: vectors[i]!,
          model: env.GROQ_EMBED_MODEL,
        })),
      )
      .onConflictDoNothing();

    embedded += usable.length;
    logger.info({ roomId, embedded, batch: usable.length }, 'backfill progress');
  }

  return embedded;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.roomIds.length === 0) {
    logger.error(
      'no rooms given. Pass --room <roomId>, repeatable. Rooms are named explicitly ' +
        'so the 505k load-test messages are never embedded by accident.',
    );
    process.exit(1);
  }

  let total = 0;
  for (const roomId of options.roomIds) {
    total += await backfillRoom(roomId, options);
  }

  logger.info({ total, dryRun: options.dryRun }, 'backfill complete');
  await pool.end();
}

void main();
