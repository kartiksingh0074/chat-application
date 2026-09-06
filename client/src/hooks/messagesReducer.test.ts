import { describe, expect, it } from 'vitest';
import { messagesReducer, type DisplayMessage } from './messagesReducer.js';

function makeDelivered(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: 'msg-1',
    roomId: 'room-1',
    senderId: 'alice',
    body: 'hello',
    attachmentKey: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'delivered',
    ...overrides,
  };
}

describe('messagesReducer', () => {
  it('reset clears the list', () => {
    const state = [makeDelivered()];
    expect(messagesReducer(state, { type: 'reset' })).toEqual([]);
  });

  it('send appends a pending message carrying its tempId', () => {
    const pending = makeDelivered({ id: 'temp-1', tempId: 'temp-1', status: 'pending' });
    const result = messagesReducer([], { type: 'send', message: pending });
    expect(result).toEqual([pending]);
  });

  it('ack reconciles the pending message by tempId, replacing id/createdAt and flipping to delivered', () => {
    const pending = makeDelivered({ id: 'temp-1', tempId: 'temp-1', status: 'pending' });
    const result = messagesReducer([pending], {
      type: 'ack',
      tempId: 'temp-1',
      id: 'real-id-1',
      createdAt: '2026-01-01T00:00:05.000Z',
    });
    expect(result).toEqual([
      { ...pending, id: 'real-id-1', createdAt: '2026-01-01T00:00:05.000Z', status: 'delivered' },
    ]);
  });

  it('ack leaves other messages untouched when the tempId does not match', () => {
    const pending = makeDelivered({ id: 'temp-1', tempId: 'temp-1', status: 'pending' });
    const result = messagesReducer([pending], {
      type: 'ack',
      tempId: 'some-other-tempid',
      id: 'real-id-2',
      createdAt: '2026-01-01T00:00:05.000Z',
    });
    expect(result).toEqual([pending]);
  });

  it('receive appends an incoming message from another sender as already delivered', () => {
    const incoming: import('@chat-application/shared').Message = {
      id: 'msg-2',
      roomId: 'room-1',
      senderId: 'bob',
      body: 'hi',
      attachmentKey: null,
      createdAt: '2026-01-01T00:00:10.000Z',
    };
    const result = messagesReducer([], { type: 'receive', message: incoming });
    expect(result).toEqual([{ ...incoming, status: 'delivered' }]);
  });

  it('fail marks a still-pending message as failed by tempId', () => {
    const pending = makeDelivered({ id: 'temp-1', tempId: 'temp-1', status: 'pending' });
    const result = messagesReducer([pending], { type: 'fail', tempId: 'temp-1' });
    expect(result[0]?.status).toBe('failed');
  });

  it('fail does not downgrade a message that already got its ack (no timeout race)', () => {
    const delivered = makeDelivered({ id: 'real-id-1', tempId: 'temp-1', status: 'delivered' });
    const result = messagesReducer([delivered], { type: 'fail', tempId: 'temp-1' });
    expect(result).toEqual([delivered]);
  });

  it('prepend puts an older page before the existing (newer) messages, preserving order', () => {
    const older = [makeDelivered({ id: 'msg-0', createdAt: '2025-12-31T00:00:00.000Z' })];
    const existing = [makeDelivered({ id: 'msg-1' })];
    const result = messagesReducer(existing, { type: 'prepend', messages: older });
    expect(result).toEqual([...older, ...existing]);
  });
});

describe('messagesReducer window actions', () => {
  const msg = (id: string): DisplayMessage => ({
    id,
    roomId: 'r1',
    senderId: 'u1',
    body: id,
    attachmentKey: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'delivered',
  });

  it('replaces the whole window when a jump lands somewhere unrelated', () => {
    const before = [msg('a'), msg('b')];
    const after = [msg('x'), msg('y')];
    expect(messagesReducer(before, { type: 'replace', messages: after })).toEqual(after);
  });

  it('appends newer messages when scrolling down after a jump', () => {
    const state = [msg('a'), msg('b')];
    const next = messagesReducer(state, { type: 'append', messages: [msg('c')] });
    expect(next.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not duplicate a message that also arrived live while the page was in flight', () => {
    const state = [msg('a'), msg('b')];
    const next = messagesReducer(state, { type: 'append', messages: [msg('b'), msg('c')] });
    expect(next.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the same array when an append adds nothing, so React can skip the render', () => {
    const state = [msg('a')];
    expect(messagesReducer(state, { type: 'append', messages: [msg('a')] })).toBe(state);
  });
});
