import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_BASE_URL } from '../config.js';

export interface AuthUser {
  id: string;
  username: string;
}

interface AuthState {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'chat-auth';
// The access token lasts 15 minutes; swap it well before that so a session
// never dies mid-use.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    return parsed.token && parsed.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(problem?.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [ready, setReady] = useState(false);
  const stateRef = useRef<AuthState | null>(null);

  stateRef.current = state;

  // Restore a session on load, so a refresh doesn't log you out.
  useEffect(() => {
    setState(readStored());
    setReady(true);
  }, []);

  const persist = useCallback((next: AuthState | null) => {
    setState(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode or storage disabled: the session just won't survive a reload.
    }
  }, []);

  const logout = useCallback(() => persist(null), [persist]);

  const login = useCallback(
    async (username: string, password: string) => {
      const body = await postJson<{ token: string; user: AuthUser }>('/auth/login', { username, password });
      persist({ token: body.token, user: body.user });
    },
    [persist],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      const body = await postJson<{ token: string; user: AuthUser }>('/auth/register', { username, password });
      persist({ token: body.token, user: body.user });
    },
    [persist],
  );

  useEffect(() => {
    if (!state) return;
    const timer = setInterval(async () => {
      const current = stateRef.current;
      if (!current) return;
      try {
        const body = await postJson<{ token: string; user: AuthUser }>('/auth/refresh', {}, current.token);
        persist({ token: body.token, user: body.user });
      } catch {
        // Token already expired or revoked - drop the session rather than
        // leaving the app in a half-broken authenticated-looking state.
        persist(null);
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state?.token, persist]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: state?.user ?? null, token: state?.token ?? null, ready, login, register, logout }),
    [state, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
