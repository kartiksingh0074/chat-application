import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { ulid } from 'ulidx';
import { BOT_USER_ID, parseBotQuestion } from '@chat-application/shared';
import { db } from '../db/client.js';
import { messages, roomBotConfig, users } from '../db/schema.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { embedQuery } from '../rag/embeddings.js';
import { NotAMemberError, retrieve } from '../rag/retrieval.js';
import type { BotQueryJob } from '../queues/botQueue.js';
import { MissingApiKeyError, streamChatCompletion } from './groq.js';
import { buildPrompt, extractCitations, NOTHING_FOUND } from './prompt.js';
import { publishToRoom } from './relay.js';

/** Used when a room has no room_bot_config row; the table's own default. */
const DEFAULT_TOP_K = 10;

/** 8.6: identical questions in a room reuse the embedding for five minutes. */
const EMBEDDING_CACHE_SECONDS = 300;

/**
 * The embedding for a question, cached per room. Normalised before hashing so
 * "When is the offsite?" and "when is the offsite" share an entry.
 */
async function cachedQueryEmbedding(cache: Redis, roomId: string, question: string): Promise<number[]> {
  const normalised = question.toLowerCase().replace(/\s+/g, ' ').replace(/[?.!\s]+$/, '').trim();
  const key = `bot:qemb:${roomId}:${createHash('sha256').update(normalised).digest('hex')}`;

  const hit = await cache.get(key);
  if (hit) return JSON.parse(hit) as number[];

  const embedding = await embedQuery(question);
  await cache.set(key, JSON.stringify(embedding), 'EX', EMBEDDING_CACHE_SECONDS);
  return embedding;
}

async function usernames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.username]));
}

/**
 * Answer one `@bot` question and stream the result into its room (8.6):
 * check the room allows it, retrieve with the asker's membership verified,
 * generate from the retrieved messages only, then save the answer as an
 * ordinary message from the bot user with its citations.
 */
export async function answerQuery(job: BotQueryJob, redis: Redis): Promise<void> {
  const { queryId, roomId, userId, question } = job;
  const send = (envelope: Parameters<typeof publishToRoom>[1]) => publishToRoom(redis, envelope);
  const fail = (message: string) => send({ event: 'bot:error', roomId, data: { queryId, message } });

  try {
    const config = await db.query.roomBotConfig.findFirst({ where: eq(roomBotConfig.roomId, roomId) });
    if (config && !config.enabled) {
      await fail('The bot is turned off in this room.');
      return;
    }
    const topK = config?.topK ?? DEFAULT_TOP_K;

    const queryEmbedding =
      env.RETRIEVAL_MODE === 'keyword' ? undefined : await cachedQueryEmbedding(redis, roomId, question);

    // retrieve() checks membership before querying - a second time, since the
    // socket handler already did, because membership can change while a job
    // waits in the queue.
    const { messages: hits } = await retrieve({
      roomId,
      userId,
      query: question,
      mode: env.RETRIEVAL_MODE,
      // Headroom for what gets filtered out below.
      topK: topK + 10,
      queryEmbedding,
    });

    // Never answer from the bot's own earlier answers, or from the @bot
    // questions themselves - the asker's own message matches its question best
    // of all and contains nothing new.
    const sources = hits
      .filter((h) => h.body && h.senderId !== BOT_USER_ID && parseBotQuestion(h.body) === null)
      .slice(0, topK);

    let text: string;
    let citations: string[];

    if (sources.length === 0) {
      text = NOTHING_FOUND;
      citations = [];
      await send({ event: 'bot:token', roomId, data: { queryId, token: text } });
    } else {
      const names = await usernames(sources.map((s) => s.senderId));
      const prompt = buildPrompt(
        question,
        sources.map((s) => ({
          sender: names.get(s.senderId) ?? 'someone',
          createdAt: s.createdAt,
          body: s.body!,
        })),
        config?.systemPrompt,
      );

      // Tokens are published without awaiting each one. ioredis sends commands
      // on one connection in the order issued, so they still arrive in order.
      const raw = await streamChatCompletion(prompt, (token) => {
        send({ event: 'bot:token', roomId, data: { queryId, token } }).catch((err) =>
          logger.warn({ err, queryId }, 'failed to relay a bot token'),
        );
      });

      if (raw.trim().length === 0) throw new Error('model returned an empty answer');
      ({ text, citations } = extractCitations(raw, sources.map((s) => s.id)));
    }

    const id = ulid();
    const createdAt = new Date();
    await db.insert(messages).values({
      id,
      roomId,
      senderId: BOT_USER_ID,
      body: text,
      attachmentKey: null,
      citations: citations.length > 0 ? citations : null,
      createdAt,
    });

    // message:new first, so that by the time bot:complete arrives the client
    // already holds the saved message and can swap the stream out for it.
    await send({
      event: 'message:new',
      roomId,
      data: {
        id,
        roomId,
        senderId: BOT_USER_ID,
        body: text,
        attachmentKey: null,
        createdAt: createdAt.toISOString(),
        citations: citations.length > 0 ? citations : null,
      },
    });
    await send({ event: 'bot:complete', roomId, data: { queryId, messageId: id, citations } });

    logger.info({ queryId, roomId, sources: sources.length, citations: citations.length }, 'bot answered');
  } catch (err) {
    // Reasons shown to the room are generic on purpose; the detail is logged.
    if (err instanceof NotAMemberError) {
      await fail('You are not a member of this room.');
    } else if (err instanceof MissingApiKeyError) {
      await fail('The bot is not set up on this server.');
    } else {
      logger.error({ err, queryId, roomId }, 'bot query failed');
      await fail('The bot could not answer right now. Please try again.');
    }
  }
}
