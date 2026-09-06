import { useState } from 'react';
import { roomTitle, type Room } from '../hooks/useRooms.js';
import { Avatar, Button, EmptyState, Input, Spinner } from '../ui/primitives.js';

interface SidebarProps {
  rooms: Room[];
  loading: boolean;
  activeRoomId: string | null;
  onSelect: (roomId: string) => void;
  onNewRoom: () => void;
  onNewDm: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  username: string;
  connected: boolean;
  onClose?: () => void;
}

export function Sidebar({
  rooms,
  loading,
  activeRoomId,
  onSelect,
  onNewRoom,
  onNewDm,
  onOpenSettings,
  onLogout,
  username,
  connected,
  onClose,
}: SidebarProps) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const visible = rooms.filter((r) => roomTitle(r).toLowerCase().includes(needle));
  const groups = visible.filter((r) => !r.isDirect);
  const direct = visible.filter((r) => r.isDirect);

  function renderRoom(room: Room) {
    const active = room.id === activeRoomId;
    const title = roomTitle(room);
    return (
      <li key={room.id}>
        <button
          onClick={() => {
            onSelect(room.id);
            onClose?.();
          }}
          aria-current={active ? 'true' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition
            ${active ? 'bg-brand-subtle font-medium text-brand' : 'text-content-muted hover:bg-surface-sunken hover:text-content'}`}
        >
          {room.isDirect ? (
            <Avatar name={title} size={26} />
          ) : (
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-xs">
              #
            </span>
          )}
          <span className="truncate">{title}</span>
        </button>
      </li>
    );
  }

  return (
    <aside className="flex h-full w-72 flex-col border-r border-border-subtle bg-surface-raised">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h1 className="text-sm font-semibold text-content">Chat</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={onNewDm} aria-label="New direct message" className="px-2 py-1">
            ✉️
          </Button>
          <Button variant="ghost" onClick={onNewRoom} aria-label="New room" className="px-2 py-1">
            ＋
          </Button>
          {onClose && (
            <Button variant="ghost" onClick={onClose} aria-label="Close sidebar" className="px-2 py-1 md:hidden">
              ✕
            </Button>
          )}
        </div>
      </div>

      <div className="px-3 py-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex justify-center py-6 text-content-muted">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState title="No conversations" hint="Create a room to get started." />
        ) : (
          <>
            {groups.length > 0 && (
              <>
                <p className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Rooms
                </p>
                <ul className="flex flex-col gap-0.5">{groups.map(renderRoom)}</ul>
              </>
            )}
            {direct.length > 0 && (
              <>
                <p className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Direct messages
                </p>
                <ul className="flex flex-col gap-0.5">{direct.map(renderRoom)}</ul>
              </>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-border-subtle p-3">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Avatar name={username} size={32} />
            <span
              title={connected ? 'Connected' : 'Reconnecting'}
              className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-raised
                ${connected ? 'bg-success' : 'bg-warning'}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-content">{username}</p>
            <p className="text-xs text-content-muted">{connected ? 'Online' : 'Reconnecting…'}</p>
          </div>
          <Button variant="ghost" onClick={onOpenSettings} aria-label="Settings" className="px-2 py-1">
            ⚙️
          </Button>
          <Button variant="ghost" onClick={onLogout} aria-label="Log out" className="px-2 py-1">
            ⏻
          </Button>
        </div>
      </div>
    </aside>
  );
}
