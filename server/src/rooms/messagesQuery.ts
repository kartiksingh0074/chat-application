import { and, asc, desc, eq, gt, lt, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { messages } from '../db/schema.js';

/**
 * What a client receives for a message. Listed explicitly rather than
 * `select()`, which returns every column - including `body_tsv`, so each page
 * of history was shipping every message's search index to the browser.
 */
export const messageColumns = {
  id: messages.id,
  roomId: messages.roomId,
  senderId: messages.senderId,
  body: messages.body,
  attachmentKey: messages.attachmentKey,
  createdAt: messages.createdAt,
  citations: messages.citations,
};

/**
 * Cursor pagination for scrollback: `before` is the id (ULID) of the oldest
 * message already loaded. Never uses OFFSET - id is both the sort key and
 * the pagination cursor, so this is a single indexed range scan on
 * idx_messages_room_id_desc regardless of how deep into history it goes.
 */
export function buildMessagesPageQuery(roomId: string, before: string | undefined, limit: number) {
  const condition = before
    ? and(eq(messages.roomId, roomId), lt(messages.id, before))
    : eq(messages.roomId, roomId);

  return db
    .select(messageColumns)
    .from(messages)
    .where(condition)
    .orderBy(desc(messages.id))
    .limit(limit);
}

/**
 * The forward direction, needed once the client can land in the middle of
 * history via `around`: from there, scrolling *down* has somewhere to go.
 * Ascending so the scan walks away from the cursor - a b-tree reads either
 * way, so this is still a bounded index scan and never an OFFSET.
 */
export function buildMessagesAfterQuery(roomId: string, after: string, limit: number) {
  return db
    .select(messageColumns)
    .from(messages)
    .where(and(eq(messages.roomId, roomId), gt(messages.id, after)))
    .orderBy(asc(messages.id))
    .limit(limit);
}

/**
 * The page surrounding one message, for jumping to a citation.
 *
 * Two bounded range scans rather than one: `id <= target` descending for the
 * older half, `id > target` ascending for the newer half. Neither uses OFFSET,
 * so this costs the same whether the target is the newest message or a year
 * back. The target is included in the older half, so it is always present when
 * it exists at all.
 */
export function buildMessagesAtOrBeforeQuery(roomId: string, target: string, limit: number) {
  return db
    .select(messageColumns)
    .from(messages)
    .where(and(eq(messages.roomId, roomId), lte(messages.id, target)))
    .orderBy(desc(messages.id))
    .limit(limit);
}

export interface MessageWindow {
  messages: Awaited<ReturnType<typeof buildMessagesPageQuery>>;
  hasMore: boolean;
  hasMoreNewer: boolean;
}

export async function fetchMessagesAround(
  roomId: string,
  target: string,
  limit: number,
): Promise<MessageWindow> {
  const olderLimit = Math.ceil(limit / 2);
  const newerLimit = Math.max(1, limit - olderLimit);

  const [olderDesc, newer] = await Promise.all([
    buildMessagesAtOrBeforeQuery(roomId, target, olderLimit),
    buildMessagesAfterQuery(roomId, target, newerLimit),
  ]);

  return {
    messages: [...olderDesc.reverse(), ...newer],
    hasMore: olderDesc.length === olderLimit,
    hasMoreNewer: newer.length === newerLimit,
  };
}
