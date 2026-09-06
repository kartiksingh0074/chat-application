import { describe, expect, it } from 'vitest';
import { roomTitle, type Room } from './useRooms.js';

const dm = (peer: Room['peer']): Room => ({
  id: 'r1',
  name: 'alice & bob',
  isDirect: true,
  peer,
});

describe('roomTitle', () => {
  it('shows each participant the other one', () => {
    // The same stored row, fetched by each of them. The bug was that both saw
    // "alice & bob", which is the wrong label for either.
    expect(roomTitle(dm({ id: 'u2', username: 'bob' }))).toBe('bob');
    expect(roomTitle(dm({ id: 'u1', username: 'alice' }))).toBe('alice');
  });

  it('falls back to the stored name when no peer came back', () => {
    expect(roomTitle(dm(null))).toBe('alice & bob');
    expect(roomTitle(dm(undefined))).toBe('alice & bob');
  });

  it('leaves group room names alone', () => {
    const room: Room = { id: 'r2', name: 'general', isDirect: false };
    expect(roomTitle(room)).toBe('general');
  });
});
