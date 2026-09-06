import { useState } from 'react';
import type { DirectoryUser } from '../hooks/useUsers.js';
import type { Member } from '../hooks/useMembers.js';
import { UserPicker } from './UserPicker.js';
import { Avatar, Button, Field, Input, Modal, Spinner } from '../ui/primitives.js';

export function NewRoomDialog({
  token,
  onClose,
  onCreate,
}: {
  token: string;
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<DirectoryUser[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(user: DirectoryUser) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  }

  async function submit() {
    if (name.trim().length === 0) return;
    setBusy(true);
    try {
      await onCreate(name.trim(), selected.map((u) => u.id));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New room" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Room name" htmlFor="room-name">
          <Input
            id="room-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="engineering"
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-content">Add people (optional)</span>
          <UserPicker token={token} selected={selected} onToggle={toggle} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || name.trim().length === 0}>
            {busy && <Spinner />} Create room
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function NewDmDialog({
  token,
  onClose,
  onStart,
}: {
  token: string;
  onClose: () => void;
  onStart: (userId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function pick(user: DirectoryUser) {
    setBusy(true);
    try {
      await onStart(user.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New message" onClose={onClose}>
      {busy ? (
        <div className="flex justify-center py-8 text-content-muted">
          <Spinner />
        </div>
      ) : (
        <UserPicker token={token} selected={[]} onToggle={pick} multiple={false} />
      )}
    </Modal>
  );
}

export function MembersDialog({
  members,
  online,
  currentUserId,
  onClose,
}: {
  members: Member[];
  online: Set<string>;
  currentUserId: string;
  onClose: () => void;
}) {
  return (
    <Modal title={`Members (${members.length})`} onClose={onClose}>
      <ul className="max-h-80 overflow-y-auto">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 rounded-lg px-1 py-2">
            <div className="relative">
              <Avatar name={m.username} size={32} />
              {online.has(m.id) && (
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-success" />
              )}
            </div>
            <span className="flex-1 truncate text-sm text-content">
              {m.username}
              {m.id === currentUserId && <span className="text-content-muted"> (you)</span>}
            </span>
            <span className="text-xs text-content-muted">{online.has(m.id) ? 'Online' : 'Offline'}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <img src={url} alt="Attachment preview" className="max-h-full max-w-full rounded-card object-contain" />
      <button
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-1.5 text-white transition hover:bg-white/20"
      >
        ✕
      </button>
    </div>
  );
}
