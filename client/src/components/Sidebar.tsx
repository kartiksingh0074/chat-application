import { useState, type ReactNode } from 'react';
import { roomAvatarKey, roomTitle, type Room } from '../hooks/useRooms.js';
import { useStoredState } from '../hooks/useStoredState.js';
import { Avatar, Button, EmptyState, Input, SidebarSkeleton } from '../ui/primitives.js';

interface SidebarProps {
  rooms: Room[];
  loading: boolean;
  activeRoomId: string | null;
  onSelect: (roomId: string) => void;
  onNewRoom: () => void;
  onNewDm: () => void;
  onFindPeople: () => void;
  peopleActive: boolean;
  avatarKey?: string | null;
  onOpenSettings: () => void;
  onLogout: () => void;
  username: string;
  connected: boolean;
  onClose?: () => void;
}

function Section({
  label,
  count,
  storageKey,
  children,
}: {
  label: string;
  count: number;
  storageKey: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useStoredState(storageKey, false);

  return (
    <section className="pt-3">
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="group flex w-full items-center gap-1 px-2 pb-1 text-xs font-semibold uppercase
          tracking-wide text-content-muted transition hover:text-content"
      >
        <span
          aria-hidden
          className={`inline-block transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
        >
          ▾
        </span>
        <span className="truncate">{label}</span>
        <span className="ml-auto tabular-nums opacity-60">{count}</span>
      </button>
      {!collapsed && <ul className="flex flex-col gap-0.5">{children}</ul>}
    </section>
  );
}

export function Sidebar({
  rooms,
  loading,
  activeRoomId,
  onSelect,
  onNewRoom,
  onNewDm,
  onFindPeople,
  peopleActive,
  avatarKey,
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
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition
            ${
              active
                ? 'bg-brand-subtle font-medium text-brand'
                : 'text-content-muted hover:bg-surface-sunken hover:text-content'
            }`}
        >
          {room.isDirect ? (
            <Avatar name={title} size={26} avatarKey={roomAvatarKey(room)} />
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
    <aside className="flex h-full w-72 flex-col border-r border-border-subtle bg-surface-nav">
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

      <div className="px-2 pt-2">
        <button
          onClick={onFindPeople}
          aria-current={peopleActive ? 'true' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition
            ${
              peopleActive
                ? 'bg-brand-subtle font-medium text-brand'
                : 'text-content-muted hover:bg-surface-sunken hover:text-content'
            }`}
        >
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-xs">
            🔍
          </span>
          <span className="truncate">Find people</span>
        </button>
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
          <SidebarSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            title={needle ? 'No matches' : 'No conversations'}
            hint={needle ? 'Try a different search.' : 'Create a room to get started.'}
          />
        ) : (
          <>
            {groups.length > 0 && (
              <Section label="Rooms" count={groups.length} storageKey="chat-sidebar-rooms-collapsed">
                {groups.map(renderRoom)}
              </Section>
            )}
            {direct.length > 0 && (
              <Section label="Direct messages" count={direct.length} storageKey="chat-sidebar-dms-collapsed">
                {direct.map(renderRoom)}
              </Section>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-border-subtle p-3">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Avatar name={username} size={32} avatarKey={avatarKey} />
            <span
              title={connected ? 'Connected' : 'Reconnecting'}
              className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-nav
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
