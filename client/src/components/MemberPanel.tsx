import type { Member } from '../hooks/useMembers.js';
import { Avatar } from '../ui/primitives.js';

interface MemberPanelProps {
  members: Member[];
  online: Set<string>;
  currentUserId: string;
  onOpenProfile: (userId: string, anchor: DOMRect) => void;
}

function MemberRow({
  member,
  isOnline,
  isYou,
  onOpenProfile,
}: {
  member: Member;
  isOnline: boolean;
  isYou: boolean;
  onOpenProfile: (userId: string, anchor: DOMRect) => void;
}) {
  return (
    <li>
      <button
        onClick={(e) => onOpenProfile(member.id, e.currentTarget.getBoundingClientRect())}
        aria-label={`View ${member.username}'s profile`}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition
          hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-1
          focus-visible:outline-brand ${isOnline ? '' : 'opacity-55'}`}
      >
        <span className="relative shrink-0">
          <Avatar name={member.username} size={30} avatarKey={member.avatarKey} />
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
      </button>
    </li>
  );
}

/**
 * The right-hand roster. Online first, because that is the half you can
 * actually reach; offline is dimmed rather than hidden so the room still shows
 * its full size.
 */
export function MemberPanel({ members, online, currentUserId, onOpenProfile }: MemberPanelProps) {
  const sorted = [...members].sort((a, b) => a.username.localeCompare(b.username));
  const onlineMembers = sorted.filter((m) => online.has(m.id));
  const offlineMembers = sorted.filter((m) => !online.has(m.id));

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-l border-border-subtle bg-surface-nav pt-2">
      <div className="overflow-y-auto px-2 py-3">
        {onlineMembers.length > 0 && (
          <>
            <h3 className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              Online — {onlineMembers.length}
            </h3>
            <ul className="mb-4 flex flex-col gap-0.5">
              {onlineMembers.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isOnline
                  isYou={m.id === currentUserId}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </ul>
          </>
        )}

        {offlineMembers.length > 0 && (
          <>
            <h3 className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              Offline — {offlineMembers.length}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {offlineMembers.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isOnline={false}
                  isYou={m.id === currentUserId}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
