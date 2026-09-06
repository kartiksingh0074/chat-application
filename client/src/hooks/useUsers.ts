import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config.js';

export interface DirectoryUser {
  id: string;
  username: string;
  avatarKey?: string | null;
}

/** Debounced user search, for picking people to add to a room or DM. */
export function useUsers(token: string, query: string) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const url = new URL(`${API_BASE_URL}/users`);
        if (query.trim()) url.searchParams.set('q', query.trim());
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { users: DirectoryUser[] };
        if (!cancelled) setUsers(body.users);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, query]);

  return { users, loading };
}
