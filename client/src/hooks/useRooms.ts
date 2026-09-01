import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config.js';

export interface Room {
  id: string;
  name: string;
  isDirect: boolean;
}

export function useRooms(token: string) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rooms`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`failed to load rooms (${res.status})`);
      const body = (await res.json()) as { rooms: Room[] };
      setRooms(body.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const createRoom = useCallback(
    async (name: string, memberIds: string[]) => {
      const res = await fetch(`${API_BASE_URL}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, memberIds }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(problem?.message ?? `Could not create room (${res.status})`);
      }
      const body = (await res.json()) as { room: Room };
      await load();
      return body.room;
    },
    [token, load],
  );

  const openDirectMessage = useCallback(
    async (userId: string) => {
      const res = await fetch(`${API_BASE_URL}/rooms/dm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(problem?.message ?? `Could not open conversation (${res.status})`);
      }
      const body = (await res.json()) as { room: Room };
      await load();
      return body.room;
    },
    [token, load],
  );

  return { rooms, loading, error, reload: load, createRoom, openDirectMessage };
}
