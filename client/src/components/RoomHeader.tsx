import type { Member } from '../hooks/useMembers.js';
import { roomAvatarKey, roomTitle, type Room } from '../hooks/useRooms.js';
import { Avatar, IconButton } from '../ui/primitives.js';
import { HashIcon, MenuIcon, UsersIcon } from '../ui/icons.js';

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
  const onlineCount = members.filter((m) => online.has(m.id)).length;
  // Prefer the peer the rooms list already carries: it is present before the
  // members request resolves, so the header does not flash the wrong name.
  const others = members.filter((m) => m.id !== currentUserId);
  const partnerId = room.isDirect ? (room.peer?.id ?? others[0]?.id) : undefined;
  const partnerOnline = partnerId ? online.has(partnerId) : false;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-3 sm:px-4">
      <IconButton label="Open conversations" onClick={onOpenSidebar} className="md:hidden">
        <MenuIcon />
      </IconButton>

      {room.isDirect ? (
        <span className="relative shrink-0">
          <Avatar name={title} size={28} avatarKey={roomAvatarKey(room)} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface
              ${partnerOnline ? 'bg-success' : 'bg-content-muted/60'}`}
          />
        </span>
      ) : (
        <HashIcon size={22} className="shrink-0 text-content-muted" />
      )}

      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <h2 className="truncate text-[15px] font-semibold tracking-tight text-content">{title}</h2>
        <p className="hidden truncate text-xs text-content-muted sm:block">
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
          <IconButton label="Members" onClick={onOpenMembers} className="xl:hidden">
            <UsersIcon />
          </IconButton>
          <IconButton
            label={memberPanelOpen ? 'Hide member list' : 'Show member list'}
            onClick={onToggleMemberPanel}
            active={memberPanelOpen}
            aria-pressed={memberPanelOpen}
            // max-xl:hidden, not "hidden xl:inline-flex": IconButton sets inline-flex
            // itself, and that plain utility outranks a plain `hidden`, which left
            // both Members buttons showing on narrow screens.
            className="max-xl:hidden"
          >
            <UsersIcon />
          </IconButton>
        </>
      )}
    </header>
  );
}
