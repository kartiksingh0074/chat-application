export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  body: string | null;
  attachmentKey: string | null;
  createdAt: string;
}

export interface ServerToClientEvents {
  'message:new': (m: Message) => void;
  'message:ack': (p: { tempId: string; id: string; createdAt: string }) => void;
  'presence:update': (p: { userId: string; online: boolean }) => void;
  'typing:update': (p: { roomId: string; userId: string; username: string; typing: boolean }) => void;
  // Phase 8 (PROJECT.md 8.6). The client renders these today so the bot has
  // somewhere to stream into; nothing emits them until the bot service exists.
  'bot:token': (p: { queryId: string; token: string }) => void;
  'bot:complete': (p: { queryId: string; messageId: string; citations: string[] }) => void;
  'bot:error': (p: { queryId: string; message: string }) => void;
  'error': (p: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'message:send': (p: { roomId: string; tempId: string; body?: string; attachmentKey?: string }) => void;
  'room:join': (p: { roomId: string }) => void;
  'room:leave': (p: { roomId: string }) => void;
  'typing:start': (p: { roomId: string }) => void;
  'typing:stop': (p: { roomId: string }) => void;
}

/**
 * Longest message body the server accepts. Shared so the composer's counter
 * and the socket handler's validation cannot drift apart.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * How long a typing indicator survives without a refresh. The client
 * re-emits well inside this, so a dropped 'typing:stop' - a closed tab, a
 * lost connection - expires on its own rather than sticking forever.
 */
export const TYPING_TIMEOUT_MS = 6000;

/** How often a client may re-announce that it is still typing. */
export const TYPING_REFRESH_MS = 2500;
