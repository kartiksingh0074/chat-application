import { useEffect, useState } from 'react';
import { useSocket } from '../socket/SocketProvider.js';

/**
 * Online users, driven by the presence:update events the server has been
 * broadcasting (Redis-backed) since Phase 5 - the client just never listened.
 */
export function usePresence() {
  const socket = useSocket();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    function handle(p: { userId: string; online: boolean }) {
      setOnline((prev) => {
        const next = new Set(prev);
        if (p.online) next.add(p.userId);
        else next.delete(p.userId);
        return next;
      });
    }

    socket.on('presence:update', handle);
    return () => {
      socket.off('presence:update', handle);
    };
  }, [socket]);

  return online;
}
