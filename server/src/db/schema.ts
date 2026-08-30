import { boolean, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(), // ULID
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(), // argon2
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
  },
  // The only index scrollback needs. Do not add an index on created_at.
  (table) => [index('idx_messages_room_id_desc').on(table.roomId, table.id.desc())],
);
