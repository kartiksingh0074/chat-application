import { useState } from 'react';
import { useUsers, type DirectoryUser } from '../hooks/useUsers.js';
import { Avatar, Button, EmptyState, Input, Spinner } from '../ui/primitives.js';

interface PeoplePageProps {
  token: string;
  online: Set<string>;
  onMessage: (userId: string) => void;
  onOpenProfile: (userId: string, anchor: DOMRect) => void;
  onOpenSidebar: () => void;
}

/**
 * Search across every account, not just the people already in a shared room.
 * The endpoint behind it (`GET /users?q=`) has existed since the room-creation
 * dialog needed it - this makes it a place you can actually go.
 */
export function PeoplePage({ token, online, onMessage, onOpenProfile, onOpenSidebar }: PeoplePageProps) {
  const [query, setQuery] = useState('');
  const { users, loading } = useUsers(token, query);
  const [starting, setStarting] = useState<string | null>(null);

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
      <header className="flex items-center gap-3 border-b border-border-subtle bg-surface px-4 py-3">
        <Button
          variant="ghost"
          onClick={onOpenSidebar}
          aria-label="Open conversations"
          className="px-2 py-1 md:hidden"
        >
          ☰
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-content">Find people</h2>
          <p className="text-xs text-content-muted">Search everyone on this server</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username"
          aria-label="Search people by username"
        />
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
                  className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-raised
                    px-3 py-2.5 transition hover:border-brand/40"
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
                    className="shrink-0 px-3 py-1.5 text-xs"
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
