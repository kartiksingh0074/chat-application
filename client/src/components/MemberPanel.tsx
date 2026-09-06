import type { Member } from '../hooks/useMembers.js';
import { Avatar } from '../ui/primitives.js';

interface MemberPanelProps {
  members: Member[];
  online: Set<string>;
  currentUserId: string;
}

function MemberRow({ member, isOnline, isYou }: { member: Member; isOnline: boolean; isYou: boolean }) {
  return (
    <li>
      <div
        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-sunken
          ${isOnline ? '' : 'opacity-45'}`}
      >
        <span className="relative shrink-0">
          <Avatar name={member.username} size={30} />
          <span
            title={isOnline ? 'Online' : 'Offline'}
            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-nav
              ${isOnline ? 'bg-success' : 'bg-content-muted'}`}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-content">
          {member.username}
          {isYou && <span className="text-content-muted"> (you)</span>}
        </span>
      </div>
    </li>
  );
}

/**
 * The right-hand roster. Online first, because that is the half you can
 * actually reach; offline is dimmed rather than hidden so the room still shows
 * its full size.
 */
export function MemberPanel({ members, online, currentUserId }: MemberPanelProps) {
  const sorted = [...members].sort((a, b) => a.username.localeCompare(b.username));
  const onlineMembers = sorted.filter((m) => online.has(m.id));
  const offlineMembers = sorted.filter((m) => !online.has(m.id));

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-l border-border-subtle bg-surface-nav">
      <div className="overflow-y-auto px-2 py-3">
        {onlineMembers.length > 0 && (
          <>
            <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
              Online — {onlineMembers.length}
            </h3>
            <ul className="mb-4 flex flex-col gap-0.5">
              {onlineMembers.map((m) => (
                <MemberRow key={m.id} member={m} isOnline isYou={m.id === currentUserId} />
              ))}
            </ul>
          </>
        )}

        {offlineMembers.length > 0 && (
          <>
            <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
              Offline — {offlineMembers.length}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {offlineMembers.map((m) => (
                <MemberRow key={m.id} member={m} isOnline={false} isYou={m.id === currentUserId} />
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
