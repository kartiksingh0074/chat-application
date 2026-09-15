import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  vector,
} from 'drizzle-orm/pg-core';

/**
 * Width of the embedding vectors, fixed in the column type by pgvector.
 *
 * PROJECT.md 8.3 specifies 1536, which is `text-embedding-3-small`'s width.
 * This build embeds locally with `bge-small-en-v1.5` - the alternative 2 names -
 * which is 384. The embedding client asserts the model's actual width against
 * this, so a model swap fails loudly instead of writing mismatched vectors.
 */
export const EMBEDDING_DIMENSIONS = 384;

/** Postgres full-text type; drizzle has no built-in for it. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

export const users = pgTable('users', {
  id: text('id').primaryKey(), // ULID
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // argon2
  avatarKey: text('avatar_key'), // MinIO object key, nullable - initials are the fallback
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(), // ULID
  name: text('name').notNull(),
  isDirect: boolean('is_direct').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roomMembers = pgTable(
  'room_members',
  {
    roomId: text('room_id').notNull().references(() => rooms.id),
    userId: text('user_id').notNull().references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.userId] })],
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(), // ULID, chronologically sortable
    roomId: text('room_id').notNull().references(() => rooms.id),
    senderId: text('sender_id').notNull().references(() => users.id),
    body: text('body'),
    attachmentKey: text('attachment_key'), // MinIO object key, nullable
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // The keyword arm of the hybrid search (8.5). Generated rather than
    // maintained in application code, so it can never drift from `body`.
    bodyTsv: tsvector('body_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(body, ''))`,
    ),
  },
  (table) => [
    // The only index scrollback needs. Do not add an index on created_at.
    index('idx_messages_room_id_desc').on(table.roomId, table.id.desc()),
    index('idx_messages_tsv').using('gin', table.bodyTsv),
  ],
);

/**
 * One row per embedded message. `room_id` is denormalised on purpose: 8.5
 * requires the room filter to sit in the WHERE clause of the vector search
 * itself, so it has to be on this table rather than reached through a join.
 */
export const messageEmbeddings = pgTable(
  'message_embeddings',
  {
    messageId: text('message_id')
      .primaryKey()
      .references(() => messages.id, { onDelete: 'cascade' }),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    model: text('model').notNull(), // so a model swap is detectable
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_embeddings_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('idx_embeddings_room').on(table.roomId),
  ],
);

/**
 * Per-room bot settings. A table, not an instance: 8.2 is explicit that there
 * is one bot service and one embeddings table, and a room is a WHERE clause.
 */
export const roomBotConfig = pgTable('room_bot_config', {
  roomId: text('room_id')
    .primaryKey()
    .references(() => rooms.id),
  enabled: boolean('enabled').notNull().default(true),
  systemPrompt: text('system_prompt'),
  topK: integer('top_k').notNull().default(10),
});
