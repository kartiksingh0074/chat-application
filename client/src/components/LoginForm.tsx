import { useState, type FormEvent } from 'react';

const AUTH_URL = 'http://localhost:4000/auth/login';

export interface LoggedInUser {
  token: string;
  id: string;
  username: string;
}

export function LoginForm({ onLogin }: { onLogin: (user: LoggedInUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: 'Login failed' }));
      setError(body.message ?? 'Login failed');
      return;
    }
    const body = (await res.json()) as { token: string; user: { id: string; username: string } };
    onLogin({ token: body.token, id: body.user.id, username: body.user.username });
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 320, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Sign in</h1>
      <p style={{ color: '#666', fontSize: 14 }}>
        Use a seeded demo account (e.g. alice / bob, password: password123).
      </p>
      <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Log in</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}
