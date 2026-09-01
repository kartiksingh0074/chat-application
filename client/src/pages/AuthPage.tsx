import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { Button, Field, Input, Spinner } from '../ui/primitives.js';

type Mode = 'signin' | 'signup';

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignup) {
      if (username.trim().length < 3) return setError('Username must be at least 3 characters.');
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
    }

    setBusy(true);
    try {
      if (isSignup) await register(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface-sunken p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-card bg-brand text-2xl">
            💬
          </div>
          <h1 className="text-xl font-semibold text-content">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            {isSignup ? 'Pick a username to get started.' : 'Sign in to continue to your rooms.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-6 shadow-sm"
        >
          <Field label="Username" htmlFor="username">
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>

          {isSignup && (
            <Field label="Confirm password" htmlFor="confirm">
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy && <Spinner />}
            {isSignup ? 'Create account' : 'Sign in'}
          </Button>

          <p className="text-center text-sm text-content-muted">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
              className="font-medium text-brand hover:underline"
            >
              {isSignup ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </form>

        {!isSignup && (
          <p className="mt-4 text-center text-xs text-content-muted">
            Demo accounts: <code className="font-mono">alice</code> / <code className="font-mono">bob</code>,
            password <code className="font-mono">password123</code>
          </p>
        )}
      </div>
    </div>
  );
}
