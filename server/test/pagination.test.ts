import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://chatapp:chatapp@localhost:5433/chatapp';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.CORS_ORIGIN ??= 'http://localhost:5173';
});

describe('buildMessagesPageQuery', () => {
  it('never uses OFFSET, for the first page or any subsequent one', async () => {
    const { buildMessagesPageQuery } = await import('../src/rooms/messagesQuery.js');

    const firstPage = buildMessagesPageQuery('room-1', undefined, 50).toSQL();
    const nextPage = buildMessagesPageQuery('room-1', '01JAAA0000000000000000000', 50).toSQL();

    expect(firstPage.sql.toUpperCase()).not.toContain('OFFSET');
    expect(nextPage.sql.toUpperCase()).not.toContain('OFFSET');
  });

  it('orders by id descending with a LIMIT, so it can use idx_messages_room_id_desc', async () => {
    const { buildMessagesPageQuery } = await import('../src/rooms/messagesQuery.js');
    const { sql } = buildMessagesPageQuery('room-1', undefined, 50).toSQL();

    expect(sql.toUpperCase()).toContain('ORDER BY');
    expect(sql.toUpperCase()).toContain('DESC');
    expect(sql.toUpperCase()).toContain('LIMIT');
  });

  it('filters on room_id and id < cursor when a cursor is given, and binds both as params', async () => {
    const { buildMessagesPageQuery } = await import('../src/rooms/messagesQuery.js');
    const { sql, params } = buildMessagesPageQuery('room-42', '01JAAA0000000000000000000', 25).toSQL();

    expect(sql).toContain('<');
    expect(params).toContain('room-42');
    expect(params).toContain('01JAAA0000000000000000000');
    expect(params).toContain(25);
  });

  it('omits the cursor condition entirely for the first page', async () => {
    const { buildMessagesPageQuery } = await import('../src/rooms/messagesQuery.js');
    const { params } = buildMessagesPageQuery('room-42', undefined, 25).toSQL();

    expect(params).toEqual(['room-42', 25]);
  });
});

describe('the around/after query shapes', () => {
  it('walks forward with id > cursor ascending, and still no OFFSET', async () => {
    const { buildMessagesAfterQuery } = await import('../src/rooms/messagesQuery.js');
    const { sql, params } = buildMessagesAfterQuery('room-1', '01JAAA0000000000000000000', 25).toSQL();

    expect(sql.toUpperCase()).not.toContain('OFFSET');
    expect(sql.toUpperCase()).toContain('ASC');
    expect(sql).toContain('>');
    expect(params).toEqual(['room-1', '01JAAA0000000000000000000', 25]);
  });

  it('takes the older half with id <= target, so the target itself is in the window', async () => {
    const { buildMessagesAtOrBeforeQuery } = await import('../src/rooms/messagesQuery.js');
    const { sql, params } = buildMessagesAtOrBeforeQuery('room-1', '01JAAA0000000000000000000', 25).toSQL();

    expect(sql.toUpperCase()).not.toContain('OFFSET');
    expect(sql.toUpperCase()).toContain('DESC');
    expect(sql).toContain('<=');
    expect(params).toEqual(['room-1', '01JAAA0000000000000000000', 25]);
  });

  it('splits the limit across both halves so a jump costs one page, not two', async () => {
    const { buildMessagesAtOrBeforeQuery, buildMessagesAfterQuery } = await import(
      '../src/rooms/messagesQuery.js'
    );
    // Mirrors fetchMessagesAround's split: ceil older, the rest newer.
    const limit = 50;
    const older = buildMessagesAtOrBeforeQuery('r', '01J', Math.ceil(limit / 2)).toSQL();
    const newer = buildMessagesAfterQuery('r', '01J', limit - Math.ceil(limit / 2)).toSQL();

    expect(older.params).toContain(25);
    expect(newer.params).toContain(25);
  });
});
