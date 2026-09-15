import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config.js';

export interface Member {
  id: string;
  username: string;
  avatarKey?: string | null;
  joinedAt: string;
  /** Online when the list was fetched; live presence events take over after. */
  online?: boolean;
}

/**
 * Members of the active room, plus a lookup so messages can show a username
 * instead of the raw sender ULID.
 */
export function useMembers(token: string, roomId: string | null) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!roomId) {
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { members: Member[] };
      setMembers(body.members);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [token, roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameFor = useCallback(
    (userId: string) => members.find((m) => m.id === userId)?.username ?? 'unknown',
    [members],
  );

  const avatarFor = useCallback(
    (userId: string) => members.find((m) => m.id === userId)?.avatarKey ?? null,
    [members],
  );

  return { members, loading, nameFor, avatarFor, reload: load };
}
