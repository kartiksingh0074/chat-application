import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { messages } from '../db/schema.js';

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
    .select()
    .from(messages)
    .where(condition)
    .orderBy(desc(messages.id))
    .limit(limit);
}
