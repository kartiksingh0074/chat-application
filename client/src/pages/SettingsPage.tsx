import { useAuth } from '../auth/AuthProvider.js';
import { useTheme } from '../ui/ThemeProvider.js';
import { Avatar, Button, Modal } from '../ui/primitives.js';
import { API_BASE_URL } from '../config.js';

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <section className="flex items-center gap-3">
          <Avatar name={user?.username ?? '?'} size={48} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-content">{user?.username}</p>
            <p className="truncate font-mono text-xs text-content-muted">{user?.id}</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-content">Appearance</h3>
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.value}
                variant={theme === t.value ? 'primary' : 'secondary'}
                onClick={() => setTheme(t.value)}
                className="flex-1"
                aria-pressed={theme === t.value}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-content">Connection</h3>
          <dl className="rounded-lg border border-border-subtle bg-surface-sunken p-3 text-xs">
            <div className="flex justify-between gap-2 py-0.5">
              <dt className="text-content-muted">API</dt>
              <dd className="truncate font-mono text-content">{API_BASE_URL}</dd>
            </div>
            <div className="flex justify-between gap-2 py-0.5">
              <dt className="text-content-muted">Transport</dt>
              <dd className="font-mono text-content">websocket</dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <Button variant="danger" onClick={logout}>
            Log out
          </Button>
        </section>
      </div>
    </Modal>
  );
}
