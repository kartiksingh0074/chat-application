import type { Message } from '@chat-application/shared';

export interface DisplayMessage extends Message {
  status: 'pending' | 'delivered' | 'failed';
  tempId?: string;
}

export type MessagesAction =
  | { type: 'reset' }
  | { type: 'prepend'; messages: DisplayMessage[] }
  | { type: 'append'; messages: DisplayMessage[] }
  | { type: 'replace'; messages: DisplayMessage[] }
  | { type: 'send'; message: DisplayMessage }
  | { type: 'ack'; tempId: string; id: string; createdAt: string }
  | { type: 'receive'; message: Message }
  | { type: 'fail'; tempId: string }
  | { type: 'retry'; tempId: string };

export function messagesReducer(state: DisplayMessage[], action: MessagesAction): DisplayMessage[] {
  switch (action.type) {
    case 'reset':
      return [];

    case 'prepend':
      return [...action.messages, ...state];

    // Scrolling down after landing mid-history. Filtered because a live
    // message:new can arrive for the same id while the page is in flight.
    case 'append': {
      const known = new Set(state.map((m) => m.id));
      const fresh = action.messages.filter((m) => !known.has(m.id));
      return fresh.length === 0 ? state : [...state, ...fresh];
    }

    // Jumping to a citation lands on a window that may not overlap what is
    // loaded, so the list is swapped wholesale rather than merged.
    case 'replace':
      return action.messages;

    case 'send':
      return [...state, action.message];

    case 'ack':
      return state.map((m) =>
        m.tempId === action.tempId
          ? { ...m, id: action.id, createdAt: action.createdAt, status: 'delivered' }
          : m,
      );

    case 'receive':
      return [...state, { ...action.message, status: 'delivered' }];

    case 'fail':
      return state.map((m) =>
        m.tempId === action.tempId && m.status === 'pending' ? { ...m, status: 'failed' } : m,
      );

    case 'retry':
      return state.map((m) =>
        m.tempId === action.tempId && m.status === 'failed' ? { ...m, status: 'pending' } : m,
      );

    default:
      return state;
  }
}
