/**
 * Accumulates a streaming bot answer (PROJECT.md 8.6).
 *
 * The bot streams tokens over the socket and only then persists the finished
 * text as an ordinary message. So there is a window where the answer exists
 * only here, in memory, and has no message id. This holds that transient state
 * and drops it the moment the real message lands in the list.
 *
 * Pure, so it can be tested before the bot service is built.
 */

export interface BotStream {
  queryId: string;
  roomId: string;
  /** Tokens received so far, already joined. */
  text: string;
  status: 'streaming' | 'complete' | 'error';
  /** Message ids the answer cites. Only known once the stream completes. */
  citations: string[];
  /** Set once persisted, so the list can drop this in favour of the real row. */
  messageId: string | null;
  error: string | null;
}

export type BotStreamAction =
  | { type: 'start'; queryId: string; roomId: string }
  | { type: 'token'; queryId: string; token: string }
  | { type: 'complete'; queryId: string; messageId: string; citations: string[] }
  | { type: 'error'; queryId: string; message: string }
  | { type: 'dismiss'; queryId: string }
  | { type: 'reset' };

export function botStreamReducer(state: BotStream[], action: BotStreamAction): BotStream[] {
  switch (action.type) {
    case 'reset':
      return [];

    case 'start':
      if (state.some((s) => s.queryId === action.queryId)) return state;
      return [
        ...state,
        {
          queryId: action.queryId,
          roomId: action.roomId,
          text: '',
          status: 'streaming',
          citations: [],
          messageId: null,
          error: null,
        },
      ];

    // Tokens can arrive before the client knows a query started - the server
    // may emit the first one before the request promise resolves - so an
    // unknown queryId is ignored rather than dropped silently into nothing.
    case 'token':
      return state.map((s) =>
        s.queryId === action.queryId && s.status === 'streaming'
          ? { ...s, text: s.text + action.token }
          : s,
      );

    case 'complete':
      return state.map((s) =>
        s.queryId === action.queryId
          ? { ...s, status: 'complete', messageId: action.messageId, citations: action.citations }
          : s,
      );

    case 'error':
      return state.map((s) =>
        s.queryId === action.queryId ? { ...s, status: 'error', error: action.message } : s,
      );

    case 'dismiss':
      return state.filter((s) => s.queryId !== action.queryId);

    default:
      return state;
  }
}

/**
 * Citations are only carried by the `bot:complete` event, and the messages
 * table has no column for them - so once a page is reloaded, a persisted bot
 * answer has no citations to render. Phase 8 has to decide whether to store
 * them; until then this lookup is in-memory only and empty after a refresh.
 */
export function citationsFor(streams: BotStream[], messageId: string): string[] {
  return streams.find((s) => s.messageId === messageId)?.citations ?? [];
}
