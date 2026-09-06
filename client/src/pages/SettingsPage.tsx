import { useRef, type ChangeEvent } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { useTheme } from '../ui/ThemeProvider.js';
import { useAvatarUpload } from '../hooks/useAvatarUpload.js';
import { Avatar, Button, Modal, Spinner } from '../ui/primitives.js';
import { API_BASE_URL } from '../config.js';

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { user, token, updateUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { upload, clear, uploading, error } = useAvatarUpload(token ?? '');
  const fileInput = useRef<HTMLInputElement>(null);

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const key = await upload(file);
      if (key) updateUser({ avatarKey: key });
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  async function onClear() {
    if (await clear()) updateUser({ avatarKey: null });
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <section className="flex items-center gap-4">
          <Avatar name={user?.username ?? '?'} avatarKey={user?.avatarKey} size={64} />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-content">{user?.username}</p>
              <p className="truncate font-mono text-xs text-content-muted">{user?.id}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                id="avatar-file"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                onChange={onPickFile}
                disabled={uploading}
                className="hidden"
              />
              <label
                htmlFor="avatar-file"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-surface-sunken px-3 py-1.5
                  text-xs font-medium text-content transition hover:bg-border-subtle"
              >
                {uploading ? <Spinner /> : null}
                {user?.avatarKey ? 'Change picture' : 'Upload picture'}
              </label>
              {user?.avatarKey && (
                <Button
                  variant="ghost"
                  onClick={() => void onClear()}
                  disabled={uploading}
                  className="px-2 py-1.5 text-xs"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </section>

        {error && <p className="-mt-3 text-xs text-danger">{error}</p>}

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
