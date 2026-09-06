import type { Member } from '../hooks/useMembers.js';
import { roomTitle, type Room } from '../hooks/useRooms.js';
import { Avatar, Button } from '../ui/primitives.js';

interface RoomHeaderProps {
  room: Room;
  members: Member[];
  online: Set<string>;
  currentUserId: string;
  onOpenMembers: () => void;
  onToggleMemberPanel: () => void;
  memberPanelOpen: boolean;
  onOpenSidebar: () => void;
}

export function RoomHeader({
  room,
  members,
  online,
  currentUserId,
  onOpenMembers,
  onToggleMemberPanel,
  memberPanelOpen,
  onOpenSidebar,
}: RoomHeaderProps) {
  const title = roomTitle(room);
  const others = members.filter((m) => m.id !== currentUserId);
  const onlineCount = others.filter((m) => online.has(m.id)).length;
  // Prefer the peer the rooms list already carries: it is present before the
  // members request resolves, so the header does not flash the wrong name.
  const partnerId = room.isDirect ? (room.peer?.id ?? others[0]?.id) : undefined;
  const partnerOnline = partnerId ? online.has(partnerId) : false;

  return (
    <header className="flex items-center gap-3 border-b border-border-subtle bg-surface px-4 py-3">
      <Button variant="ghost" onClick={onOpenSidebar} aria-label="Open conversations" className="px-2 py-1 md:hidden">
        ☰
      </Button>

      {room.isDirect ? (
        <Avatar name={title} size={36} />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-lg bg-surface-sunken text-sm">#</span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-content">{title}</h2>
        <p className="text-xs text-content-muted">
          {room.isDirect
            ? partnerOnline
              ? 'Online'
              : 'Offline'
            : `${members.length} member${members.length === 1 ? '' : 's'}${onlineCount > 0 ? ` · ${onlineCount} online` : ''}`}
        </p>
      </div>

      {!room.isDirect && (
        <>
          {/* Narrow screens have no room for the panel, so they keep the dialog. */}
          <Button
            variant="secondary"
            onClick={onOpenMembers}
            className="px-2.5 py-1.5 text-xs xl:hidden"
          >
            Members
          </Button>
          <Button
            variant={memberPanelOpen ? 'primary' : 'secondary'}
            onClick={onToggleMemberPanel}
            aria-pressed={memberPanelOpen}
            aria-label="Toggle member list"
            className="hidden px-2.5 py-1.5 text-xs xl:inline-flex"
          >
            Members
          </Button>
        </>
      )}
    </header>
  );
}
