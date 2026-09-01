import type { Member } from '../hooks/useMembers.js';
import type { Room } from '../hooks/useRooms.js';
import { Avatar, Button } from '../ui/primitives.js';

interface RoomHeaderProps {
  room: Room;
  members: Member[];
  online: Set<string>;
  currentUserId: string;
  onOpenMembers: () => void;
  onOpenSidebar: () => void;
}

export function RoomHeader({
  room,
  members,
  online,
  currentUserId,
  onOpenMembers,
  onOpenSidebar,
}: RoomHeaderProps) {
  const others = members.filter((m) => m.id !== currentUserId);
  const onlineCount = others.filter((m) => online.has(m.id)).length;
  const dmPartner = room.isDirect ? others[0] : undefined;
  const partnerOnline = dmPartner ? online.has(dmPartner.id) : false;

  return (
    <header className="flex items-center gap-3 border-b border-border-subtle bg-surface px-4 py-3">
      <Button variant="ghost" onClick={onOpenSidebar} aria-label="Open conversations" className="px-2 py-1 md:hidden">
        ☰
      </Button>

      {room.isDirect && dmPartner ? (
        <Avatar name={dmPartner.username} size={36} />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-lg bg-surface-sunken text-sm">#</span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-content">{room.name}</h2>
        <p className="text-xs text-content-muted">
          {room.isDirect
            ? partnerOnline
              ? 'Online'
              : 'Offline'
            : `${members.length} member${members.length === 1 ? '' : 's'}${onlineCount > 0 ? ` · ${onlineCount} online` : ''}`}
        </p>
      </div>

      {!room.isDirect && (
        <Button variant="secondary" onClick={onOpenMembers} className="px-2.5 py-1.5 text-xs">
          Members
        </Button>
      )}
    </header>
  );
}
