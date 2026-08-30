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
  'error': (p: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'message:send': (p: { roomId: string; tempId: string; body?: string; attachmentKey?: string }) => void;
  'room:join': (p: { roomId: string }) => void;
  'room:leave': (p: { roomId: string }) => void;
}
