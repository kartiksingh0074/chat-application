import { useCallback, useEffect, useRef, useState } from 'react';
import { TYPING_REFRESH_MS, TYPING_TIMEOUT_MS } from '@chat-application/shared';
import { useSocket } from '../socket/SocketProvider.js';

interface TypingUser {
  userId: string;
  username: string;
  expiresAt: number;
}

/**
 * Who is typing in the active room, and the emitter for announcing that you
 * are. The broadcast crosses node instances for free: `socket.to(room)` goes
 * through the Redis adapter, so a typist on node-1 reaches a reader on node-2.
 *
 * Indicators expire on a timer rather than relying on a matching stop event -
 * a closed tab or a dropped connection never sends one, and a stuck "someone
 * is typing" that never clears is worse than a slightly late one.
 */
export function useTyping(roomId: string | null) {
  const socket = useSocket();
  const [typists, setTypists] = useState<TypingUser[]>([]);
  const lastSentAt = useRef(0);

  useEffect(() => {
    setTypists([]);
    lastSentAt.current = 0;
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return;

    function handle(p: { roomId: string; userId: string; username: string; typing: boolean }) {
      if (p.roomId !== roomId) return;
      setTypists((prev) => {
        const others = prev.filter((t) => t.userId !== p.userId);
        if (!p.typing) return others;
        return [...others, { userId: p.userId, username: p.username, expiresAt: Date.now() + TYPING_TIMEOUT_MS }];
      });
    }

    socket.on('typing:update', handle);
    return () => {
      socket.off('typing:update', handle);
    };
  }, [socket, roomId]);

  // One interval for the whole list rather than a timer per person.
  useEffect(() => {
    if (typists.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypists((prev) => (prev.some((t) => t.expiresAt <= now) ? prev.filter((t) => t.expiresAt > now) : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [typists.length]);

  /** Called on every keystroke; throttled so it does not emit per character. */
  const notifyTyping = useCallback(() => {
    if (!socket || !roomId) return;
    const now = Date.now();
    if (now - lastSentAt.current < TYPING_REFRESH_MS) return;
    lastSentAt.current = now;
    socket.emit('typing:start', { roomId });
  }, [socket, roomId]);

  /** Called when the draft is sent or cleared. */
  const stopTyping = useCallback(() => {
    if (!socket || !roomId) return;
    if (lastSentAt.current === 0) return;
    lastSentAt.current = 0;
    socket.emit('typing:stop', { roomId });
  }, [socket, roomId]);

  return { typists, notifyTyping, stopTyping };
}

/** "alice is typing…", "alice and bob are typing…", "3 people are typing…" */
export function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
