import { describe, expect, it } from 'vitest';
import { botStreamReducer, citationsFor, type BotStream } from './botStreamReducer.js';

const start = { type: 'start', queryId: 'q1', roomId: 'r1' } as const;

describe('botStreamReducer', () => {
  it('opens a stream', () => {
    const [stream] = botStreamReducer([], start);
    expect(stream).toMatchObject({ queryId: 'q1', text: '', status: 'streaming', citations: [] });
  });

  it('does not open the same query twice', () => {
    const once = botStreamReducer([], start);
    expect(botStreamReducer(once, start)).toBe(once);
  });

  it('joins tokens in arrival order', () => {
    let state = botStreamReducer([], start);
    for (const token of ['We ', 'ship ', 'Tuesday']) {
      state = botStreamReducer(state, { type: 'token', queryId: 'q1', token });
    }
    expect(state[0]!.text).toBe('We ship Tuesday');
  });

  it('ignores tokens for a query it does not know', () => {
    const state = botStreamReducer([], start);
    expect(botStreamReducer(state, { type: 'token', queryId: 'other', token: 'x' })).toEqual(state);
  });

  it('stops accumulating once complete, so a late token cannot corrupt the answer', () => {
    let state = botStreamReducer([], start);
    state = botStreamReducer(state, { type: 'token', queryId: 'q1', token: 'done' });
    state = botStreamReducer(state, {
      type: 'complete',
      queryId: 'q1',
      messageId: 'm1',
      citations: ['c1'],
    });
    state = botStreamReducer(state, { type: 'token', queryId: 'q1', token: ' EXTRA' });

    expect(state[0]!.text).toBe('done');
    expect(state[0]!.status).toBe('complete');
    expect(state[0]!.messageId).toBe('m1');
  });

  it('records an error without discarding what already streamed', () => {
    let state = botStreamReducer([], start);
    state = botStreamReducer(state, { type: 'token', queryId: 'q1', token: 'partial' });
    state = botStreamReducer(state, { type: 'error', queryId: 'q1', message: 'upstream failed' });

    expect(state[0]).toMatchObject({ status: 'error', error: 'upstream failed', text: 'partial' });
  });

  it('tracks concurrent queries separately', () => {
    let state = botStreamReducer([], start);
    state = botStreamReducer(state, { type: 'start', queryId: 'q2', roomId: 'r1' });
    state = botStreamReducer(state, { type: 'token', queryId: 'q1', token: 'one' });
    state = botStreamReducer(state, { type: 'token', queryId: 'q2', token: 'two' });

    expect(state.map((s) => s.text)).toEqual(['one', 'two']);
  });

  it('dismisses and resets', () => {
    const state = botStreamReducer([], start);
    expect(botStreamReducer(state, { type: 'dismiss', queryId: 'q1' })).toEqual([]);
    expect(botStreamReducer(state, { type: 'reset' })).toEqual([]);
  });
});

describe('citationsFor', () => {
  const streams: BotStream[] = [
    {
      queryId: 'q1',
      roomId: 'r1',
      text: 'answer',
      status: 'complete',
      citations: ['m10', 'm11'],
      messageId: 'm99',
      error: null,
    },
  ];

  it('finds citations by the persisted message id', () => {
    expect(citationsFor(streams, 'm99')).toEqual(['m10', 'm11']);
  });

  it('returns nothing for an ordinary message', () => {
    // After a reload the lookup is empty; the saved message's own citations
    // field is what the list reads then.
    expect(citationsFor(streams, 'm10')).toEqual([]);
    expect(citationsFor([], 'm99')).toEqual([]);
  });
});
