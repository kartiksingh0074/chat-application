import { useEffect, useState } from 'react';

export interface Room {
  id: string;
  name: string;
  isDirect: boolean;
}

const ROOMS_URL = 'http://localhost:4000/rooms';

export function useRooms(token: string) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(ROOMS_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`failed to load rooms (${res.status})`);
        const body = (await res.json()) as { rooms: Room[] };
        if (!cancelled) setRooms(body.rooms);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed to load rooms');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { rooms, loading, error };
}
