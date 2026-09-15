import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulidx';

/**
 * PROJECT.md 8.7 criterion 2: "A user not in a room cannot retrieve its
 * messages - verified by an automated test." 8.5 calls this non-negotiable and
 * says to write this test, so it is written before the bot exists.
 *
 * The subtle failure it guards against is filtering *after* a top-k vector
 * search. That still leaks: returning nothing from a room you cannot see, but
 * only when your query happens to match its contents, tells you the room holds
 * something similar. So the room filter has to be inside the query, and
 * membership has to gate the query rather than its results.
 *
 * Runs against the real database - this property cannot be established by
 * inspecting SQL strings. Embeddings are written directly, so no API key or
 * embedding provider is involved.
 */

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://chatapp:chatapp@localhost:5433/chatapp';
  process.env.REDIS_URL ??= 'redis://redis:6379';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.CORS_ORIGIN ??= 'http://localhost:5173';
});

const suffix = ulid();
const insiderId = `test-insider-${suffix}`;
const outsiderId = `test-outsider-${suffix}`;
const privateRoomId = `test-private-${suffix}`;
const ownRoomId = `test-own-${suffix}`;
const secretMessageId = ulid();
const ownMessageId = ulid();

// A fixed direction, so both rooms hold a vector that is a perfect match for
// the same query. Any room leak therefore shows up as a top-ranked hit rather
// than something buried.
function unitVector(dimensions = 384): number[] {
  return Array.from({ length: dimensions }, (_, i) => (i === 0 ? 1 : 0));
}

let db: typeof import('../src/db/client.js')['db'];
let schema: typeof import('../src/db/schema.js');
let rag: typeof import('../src/rag/retrieval.js');

beforeAll(async () => {
  ({ db } = await import('../src/db/client.js'));
  schema = await import('../src/db/schema.js');
  rag = await import('../src/rag/retrieval.js');

  await db.insert(schema.users).values([
    { id: insiderId, username: `insider-${suffix}`, passwordHash: 'x' },
    { id: outsiderId, username: `outsider-${suffix}`, passwordHash: 'x' },
  ]);

  await db.insert(schema.rooms).values([
    { id: privateRoomId, name: 'private', isDirect: false },
    { id: ownRoomId, name: 'own', isDirect: false },
  ]);

  // The outsider belongs to their own room, and not to the private one.
  await db.insert(schema.roomMembers).values([
    { roomId: privateRoomId, userId: insiderId },
    { roomId: ownRoomId, userId: outsiderId },
  ]);

  await db.insert(schema.messages).values([
    {
      id: secretMessageId,
      roomId: privateRoomId,
      senderId: insiderId,
      body: 'the deployment window is tuesday night pineapple',
    },
    {
      id: ownMessageId,
      roomId: ownRoomId,
      senderId: outsiderId,
      body: 'unrelated chatter about lunch',
    },
  ]);

  await db.insert(schema.messageEmbeddings).values([
    {
      messageId: secretMessageId,
      roomId: privateRoomId,
      embedding: unitVector(),
      model: 'test',
    },
    { messageId: ownMessageId, roomId: ownRoomId, embedding: unitVector(), model: 'test' },
  ]);
});

afterAll(async () => {
  if (!db) return;
  const { inArray } = await import('drizzle-orm');
  await db
    .delete(schema.messageEmbeddings)
    .where(inArray(schema.messageEmbeddings.messageId, [secretMessageId, ownMessageId]));
  await db.delete(schema.messages).where(inArray(schema.messages.id, [secretMessageId, ownMessageId]));
  await db
    .delete(schema.roomMembers)
    .where(inArray(schema.roomMembers.roomId, [privateRoomId, ownRoomId]));
  await db.delete(schema.rooms).where(inArray(schema.rooms.id, [privateRoomId, ownRoomId]));
  await db.delete(schema.users).where(inArray(schema.users.id, [insiderId, outsiderId]));
});

describe('8.7 criterion 2 - a non-member cannot retrieve a room’s messages', () => {
  const query = 'deployment window pineapple';

  it.each(['keyword', 'vector', 'hybrid'] as const)(
    'refuses an outsider in %s mode',
    async (mode) => {
      await expect(
        rag.retrieve({
          roomId: privateRoomId,
          userId: outsiderId,
          query,
          mode,
          topK: 10,
          queryEmbedding: unitVector(),
        }),
      ).rejects.toBeInstanceOf(rag.NotAMemberError);
    },
  );

  it('still serves a member, so the check is not simply refusing everyone', async () => {
    const result = await rag.retrieve({
      roomId: privateRoomId,
      userId: insiderId,
      query,
      mode: 'hybrid',
      topK: 10,
      queryEmbedding: unitVector(),
    });
    expect(result.messages.map((m) => m.id)).toContain(secretMessageId);
  });
});

describe('8.5 - the room filter is inside the query, not applied to its output', () => {
  it('does not surface another room’s message even when it is a perfect vector match', async () => {
    // Both rooms hold the identical embedding, so a search scoped to the
    // outsider's own room would rank the private message just as highly if the
    // filter were missing or applied after the top-k.
    const result = await rag.retrieve({
      roomId: ownRoomId,
      userId: outsiderId,
      query: 'deployment window pineapple',
      mode: 'vector',
      topK: 10,
      queryEmbedding: unitVector(),
    });

    const ids = result.messages.map((m) => m.id);
    expect(ids).not.toContain(secretMessageId);
    expect(ids).toContain(ownMessageId);
  });

  it('the keyword arm is scoped the same way', async () => {
    const result = await rag.retrieve({
      roomId: ownRoomId,
      userId: outsiderId,
      // Words that appear only in the private room's message.
      query: 'deployment window pineapple',
      mode: 'keyword',
      topK: 10,
    });
    expect(result.messages.map((m) => m.id)).not.toContain(secretMessageId);
  });
});

describe('retrieved messages', () => {
  it.each(['keyword', 'vector', 'hybrid'] as const)(
    'carry a real Date in %s mode, which the bot prompt formats',
    async (mode) => {
      // The vector arm uses raw execute(), which skips drizzle's mapping and
      // returned timestamps as strings. It crashed the first live @bot answer.
      const result = await rag.retrieve({
        roomId: privateRoomId,
        userId: insiderId,
        query: 'deployment window pineapple',
        mode,
        topK: 10,
        queryEmbedding: unitVector(),
      });
      expect(result.messages.length).toBeGreaterThan(0);
      for (const m of result.messages) {
        expect(m.createdAt).toBeInstanceOf(Date);
        expect(Number.isNaN(m.createdAt.getTime())).toBe(false);
      }
    },
  );
});

describe('retrieval preconditions', () => {
  it('refuses vector and hybrid without an embedding, rather than silently degrading', async () => {
    for (const mode of ['vector', 'hybrid'] as const) {
      await expect(
        rag.retrieve({ roomId: privateRoomId, userId: insiderId, query: 'x', mode, topK: 5 }),
      ).rejects.toThrow(/needs a query embedding/);
    }
  });
});
