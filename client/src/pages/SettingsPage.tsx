import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { useTheme } from '../ui/ThemeProvider.js';
import { useAvatarUpload } from '../hooks/useAvatarUpload.js';
import { Avatar, Button, Modal, Spinner } from '../ui/primitives.js';
import { LogOutIcon } from '../ui/icons.js';

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">{title}</h3>
      {children}
    </section>
  );
}

/**
 * What a person can change about their own account. Connection details and the
 * raw user id used to live here too; they are for debugging, not for users, and
 * made the page read like a developer panel.
 */
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
      <div className="flex flex-col gap-5">
        <SettingsSection title="Profile">
          <div className="flex items-center gap-4">
            <Avatar name={user?.username ?? '?'} avatarKey={user?.avatarKey} size={64} />
            <div className="flex min-w-0 flex-col gap-2">
              <p className="truncate text-base font-semibold text-content">{user?.username}</p>
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
                  className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-surface-sunken px-3 text-xs
                    font-medium text-content transition hover:bg-border-subtle"
                >
                  {uploading ? <Spinner /> : null}
                  {user?.avatarKey ? 'Change photo' : 'Upload photo'}
                </label>
                {user?.avatarKey && (
                  <Button variant="ghost" onClick={() => void onClear()} disabled={uploading} className="h-8 px-2.5 py-0 text-xs">
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </SettingsSection>

        <SettingsSection title="Appearance">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-lg bg-surface-sunken p-1">
            {THEMES.map((t) => {
              const selected = theme === t.value;
              return (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(t.value)}
                  className={`h-8 rounded-md text-sm font-medium transition
                    focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand
                    ${selected ? 'bg-surface text-content shadow-sm' : 'text-content-muted hover:text-content'}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection title="Account">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-content-muted">
              Signed in as <span className="font-medium text-content">{user?.username}</span>
            </p>
            <Button variant="danger" onClick={logout} className="h-8 px-2.5 py-0">
              <LogOutIcon size={16} />
              Log out
            </Button>
          </div>
        </SettingsSection>
      </div>
    </Modal>
  );
}
