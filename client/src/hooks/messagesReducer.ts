import type { Message } from '@chat-application/shared';

export interface DisplayMessage extends Message {
  status: 'pending' | 'delivered' | 'failed';
  tempId?: string;
}

export type MessagesAction =
  | { type: 'reset' }
  | { type: 'prepend'; messages: DisplayMessage[] }
  | { type: 'send'; message: DisplayMessage }
  | { type: 'ack'; tempId: string; id: string; createdAt: string }
  | { type: 'receive'; message: Message }
  | { type: 'fail'; tempId: string };

export function messagesReducer(state: DisplayMessage[], action: MessagesAction): DisplayMessage[] {
  switch (action.type) {
    case 'reset':
      return [];

    case 'prepend':
      return [...action.messages, ...state];

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

    default:
      return state;
  }
}
