import { useEffect, useState } from 'react';
import { ulid } from 'ulidx';
import type { Message } from '@chat-application/shared';
import { useSocket } from '../socket/SocketProvider.js';

export interface DisplayMessage extends Message {
  status: 'pending' | 'delivered';
  tempId?: string;
}

export function useMessages(roomId: string | null, currentUserId: string) {
  const socket = useSocket();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);

  useEffect(() => {
    setMessages([]);
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit('room:join', { roomId });

    function handleNew(m: Message) {
      if (m.roomId !== roomId) return;
      setMessages((prev) => [...prev, { ...m, status: 'delivered' }]);
    }
    function handleAck(p: { tempId: string; id: string; createdAt: string }) {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === p.tempId ? { ...m, id: p.id, status: 'delivered' } : m)),
      );
    }

    socket.on('message:new', handleNew);
    socket.on('message:ack', handleAck);

    return () => {
      socket.emit('room:leave', { roomId });
      socket.off('message:new', handleNew);
      socket.off('message:ack', handleAck);
    };
  }, [socket, roomId]);

  function sendMessage(body: string) {
    if (!socket || !roomId || body.trim().length === 0) return;

    const tempId = ulid();
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        tempId,
        roomId,
        senderId: currentUserId,
        body,
        attachmentKey: null,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    ]);
    socket.emit('message:send', { roomId, tempId, body });
  }

  return { messages, sendMessage };
}
