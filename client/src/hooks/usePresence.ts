import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../socket/SocketProvider.js';

export interface PresenceSnapshot {
  id: string;
  online?: boolean;
}

/**
 * Who is online.
 *
 * Seeded from the snapshot that member lists and people search now carry, then
 * kept current by `presence:update` events. Events alone were not enough: they
 * only report changes, so anyone already online when the page loaded - the
 * viewer included - showed as offline until they reconnected.
 */
export function usePresence() {
  const socket = useSocket();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    function handle(p: { userId: string; online: boolean }) {
      setOnline((prev) => {
        if (prev.has(p.userId) === p.online) return prev;
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

  /** Merge a fresh server snapshot. Entries without a status are left alone. */
  const seed = useCallback((people: PresenceSnapshot[]) => {
    setOnline((prev) => {
      let next: Set<string> | null = null;
      for (const person of people) {
        if (person.online === undefined || prev.has(person.id) === person.online) continue;
        next ??= new Set(prev);
        if (person.online) next.add(person.id);
        else next.delete(person.id);
      }
      return next ?? prev;
    });
  }, []);

  return { online, seed };
}
