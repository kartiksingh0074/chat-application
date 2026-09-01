/**
 * Experiment 3: cursor vs OFFSET pagination at depth 10 / 1k / 100k rows.
 *
 *   npm run bench:pagination -w server
 *
 * Both fetch the same 50-row page at the same depth; only the access path
 * differs. OFFSET has to walk and discard every row it skips, cursor
 * pagination seeks straight into idx_messages_room_id_desc.
 */
import { db, pool } from '../db/client.js';
import { messages } from '../db/schema.js';
import { desc, eq, lt, and, sql } from 'drizzle-orm';

const DEPTHS = [10, 1_000, 100_000];
const PAGE_SIZE = 50;
const RUNS = 5;

async function timeIt(label: string, fn: () => Promise<unknown>) {
  await fn(); // warm up, so we don't measure first-call planning
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  console.log(`${label.padEnd(34)} median ${median.toFixed(2)} ms   (samples: ${samples.map((s) => s.toFixed(1)).join(', ')})`);
  return median;
}

async function main() {
  const room = await db.query.rooms.findFirst({ where: (r, { eq }) => eq(r.name, 'general') });
  if (!room) throw new Error('run `npm run seed` first');

  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.roomId, room.id));
  console.log(`room "general" has ${total[0]!.count} messages\n`);

  const results: Record<string, { cursor: number; offset: number }> = {};

  for (const depth of DEPTHS) {
    // The cursor that sits `depth` rows back from the newest message.
    const cursorRow = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.roomId, room.id))
      .orderBy(desc(messages.id))
      .limit(1)
      .offset(depth);
    const cursorId = cursorRow[0]?.id;
    if (!cursorId) {
      console.log(`skipping depth ${depth}: not enough rows`);
      continue;
    }

    console.log(`--- depth ${depth.toLocaleString()} ---`);
    const cursorMs = await timeIt(`cursor (id < $cursor) @ ${depth}`, () =>
      db
        .select()
        .from(messages)
        .where(and(eq(messages.roomId, room.id), lt(messages.id, cursorId)))
        .orderBy(desc(messages.id))
        .limit(PAGE_SIZE),
    );
    const offsetMs = await timeIt(`OFFSET ${depth}`, () =>
      db
        .select()
        .from(messages)
        .where(eq(messages.roomId, room.id))
        .orderBy(desc(messages.id))
        .limit(PAGE_SIZE)
        .offset(depth),
    );
    results[String(depth)] = { cursor: cursorMs, offset: offsetMs };
    console.log('');
  }

  console.log('| Depth | Cursor (ms) | OFFSET (ms) | OFFSET penalty |');
  console.log('|---|---|---|---|');
  for (const [depth, r] of Object.entries(results)) {
    console.log(
      `| ${Number(depth).toLocaleString()} | ${r.cursor.toFixed(2)} | ${r.offset.toFixed(2)} | ${(r.offset / r.cursor).toFixed(1)}x |`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
