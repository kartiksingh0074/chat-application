import { useEffect, useState } from 'react';
import { useUsers, type DirectoryUser } from '../hooks/useUsers.js';
import { Avatar, Button, EmptyState, IconButton, Spinner } from '../ui/primitives.js';
import { MenuIcon, SearchIcon, UsersIcon } from '../ui/icons.js';

interface PeoplePageProps {
  token: string;
  online: Set<string>;
  onMessage: (userId: string) => void;
  onOpenProfile: (userId: string, anchor: DOMRect) => void;
  onOpenSidebar: () => void;
  /** Search results carry a presence snapshot; hand it to the shared presence state. */
  onPresence: (people: DirectoryUser[]) => void;
}

/**
 * Search across every account, not just the people already in a shared room.
 * The endpoint behind it (`GET /users?q=`) has existed since the room-creation
 * dialog needed it - this makes it a place you can actually go.
 */
export function PeoplePage({
  token,
  online,
  onMessage,
  onOpenProfile,
  onOpenSidebar,
  onPresence,
}: PeoplePageProps) {
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const { users, loading } = useUsers(token, query);

  useEffect(() => {
    onPresence(users);
  }, [users, onPresence]);

  async function startConversation(user: DirectoryUser) {
    setStarting(user.id);
    try {
      await onMessage(user.id);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-3 sm:px-4">
        <IconButton label="Open conversations" onClick={onOpenSidebar} className="md:hidden">
          <MenuIcon />
        </IconButton>
        <UsersIcon size={22} className="shrink-0 text-content-muted" />
        <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-content">Find people</h2>
          <p className="hidden truncate text-xs text-content-muted sm:block">Everyone on this server</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-6">
        <label className="relative block">
          <span className="sr-only">Search people by username</span>
          <SearchIcon
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username"
            className="h-11 w-full rounded-xl border border-border-subtle bg-surface-raised pl-10 pr-3 text-[15px]
              text-content placeholder:text-content-muted focus:border-brand/60 focus:outline-none focus:ring-2
              focus:ring-brand/20"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-2xl">
          {loading ? (
            <div className="flex justify-center py-10 text-content-muted">
              <Spinner />
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              title={query.trim() ? `No one matches "${query.trim()}"` : 'No other accounts yet'}
              hint={query.trim() ? 'Try a shorter search.' : 'Invite someone to sign up.'}
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-content/[0.04]"
                >
                  <button
                    onClick={(e) => onOpenProfile(user.id, e.currentTarget.getBoundingClientRect())}
                    aria-label={`View ${user.username}'s profile`}
                    className="relative shrink-0 rounded-full focus-visible:outline-2
                      focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Avatar name={user.username} avatarKey={user.avatarKey} size={38} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-raised
                        ${online.has(user.id) ? 'bg-success' : 'bg-content-muted'}`}
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content">{user.username}</p>
                    <p className="text-xs text-content-muted">
                      {online.has(user.id) ? 'Online' : 'Offline'}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => void startConversation(user)}
                    disabled={starting === user.id}
                    className="h-8 shrink-0 px-3 py-0 text-xs"
                  >
                    {starting === user.id ? <Spinner /> : 'Message'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
