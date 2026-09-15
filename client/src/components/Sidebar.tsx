import { useState, type ReactNode } from 'react';
import { roomAvatarKey, roomTitle, type Room } from '../hooks/useRooms.js';
import { useStoredState } from '../hooks/useStoredState.js';
import { Avatar, EmptyState, IconButton, SidebarSkeleton } from '../ui/primitives.js';
import {
  ChevronDownIcon,
  CloseIcon,
  HashIcon,
  LogOutIcon,
  LogoIcon,
  MessagePlusIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from '../ui/icons.js';

interface SidebarProps {
  rooms: Room[];
  loading: boolean;
  activeRoomId: string | null;
  online: Set<string>;
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
    <section className="pt-4">
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider
          text-content-muted transition hover:text-content"
      >
        <ChevronDownIcon
          size={12}
          strokeWidth={2.5}
          className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
        />
        <span className="truncate">{label}</span>
        <span className="ml-auto tabular-nums opacity-70">{count}</span>
      </button>
      {!collapsed && <ul className="flex flex-col gap-px">{children}</ul>}
    </section>
  );
}

/** One row in the nav: rooms, DMs and the Find people entry share the look. */
function NavRow({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14.5px] transition
        focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand
        ${active ? 'bg-content/10 font-medium text-content' : 'text-content-muted hover:bg-content/5 hover:text-content'}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function Sidebar({
  rooms,
  loading,
  activeRoomId,
  online,
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

  function select(roomId: string) {
    onSelect(roomId);
    onClose?.();
  }

  return (
    <aside className="flex h-full w-72 flex-col border-r border-border-subtle bg-surface-nav">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3">
        <div className="flex min-w-0 items-center gap-2.5 pl-1">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-content shadow-sm">
            <LogoIcon size={17} strokeWidth={2} />
          </span>
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-content">Chat</h1>
        </div>
        <div className="flex items-center">
          <IconButton label="New room" onClick={onNewRoom}>
            <PlusIcon />
          </IconButton>
          <IconButton label="New direct message" onClick={onNewDm}>
            <MessagePlusIcon />
          </IconButton>
          {onClose && (
            <IconButton label="Close sidebar" onClick={onClose} className="md:hidden">
              <CloseIcon />
            </IconButton>
          )}
        </div>
      </div>

      <div className="px-3 pt-3">
        <label className="relative block">
          <span className="sr-only">Filter conversations</span>
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter conversations"
            className="h-8 w-full rounded-md border border-transparent bg-surface-sunken pl-8 pr-2.5 text-sm text-content
              placeholder:text-content-muted focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <NavRow active={peopleActive} onClick={onFindPeople} icon={<UsersIcon size={18} className="shrink-0" />}>
          Find people
        </NavRow>

        {loading ? (
          <SidebarSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            title={needle ? 'No matches' : 'No conversations yet'}
            hint={needle ? 'Try a different name.' : 'Create a room or message someone.'}
          />
        ) : (
          <>
            {groups.length > 0 && (
              <Section label="Rooms" count={groups.length} storageKey="chat-sidebar-rooms-collapsed">
                {groups.map((room) => (
                  <li key={room.id}>
                    <NavRow
                      active={room.id === activeRoomId}
                      onClick={() => select(room.id)}
                      icon={<HashIcon size={17} className="shrink-0 opacity-70" />}
                    >
                      {roomTitle(room)}
                    </NavRow>
                  </li>
                ))}
              </Section>
            )}
            {direct.length > 0 && (
              <Section label="Direct messages" count={direct.length} storageKey="chat-sidebar-dms-collapsed">
                {direct.map((room) => {
                  const peerOnline = room.peer ? online.has(room.peer.id) : false;
                  return (
                    <li key={room.id}>
                      <NavRow
                        active={room.id === activeRoomId}
                        onClick={() => select(room.id)}
                        icon={
                          <span className="relative shrink-0">
                            <Avatar name={roomTitle(room)} size={22} avatarKey={roomAvatarKey(room)} />
                            <span
                              title={peerOnline ? 'Online' : 'Offline'}
                              className={`absolute -bottom-px -right-px size-2.5 rounded-full border-2 border-surface-nav
                                ${peerOnline ? 'bg-success' : 'bg-content-muted/60'}`}
                            />
                          </span>
                        }
                      >
                        {roomTitle(room)}
                      </NavRow>
                    </li>
                  );
                })}
              </Section>
            )}
          </>
        )}
      </nav>

      <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-border-subtle bg-surface-sunken/40 px-3">
        <span className="relative shrink-0">
          <Avatar name={username} size={32} avatarKey={avatarKey} />
          <span
            title={connected ? 'Connected' : 'Reconnecting'}
            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-nav
              ${connected ? 'bg-success' : 'bg-warning'}`}
          />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-content">{username}</p>
          <p className="truncate text-xs text-content-muted">{connected ? 'Online' : 'Reconnecting…'}</p>
        </div>
        <IconButton label="Settings" onClick={onOpenSettings}>
          <SettingsIcon />
        </IconButton>
        <IconButton label="Log out" onClick={onLogout}>
          <LogOutIcon />
        </IconButton>
      </div>
    </aside>
  );
}
