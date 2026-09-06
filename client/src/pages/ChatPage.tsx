import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { roomTitle, useRooms } from '../hooks/useRooms.js';
import { useMessages } from '../hooks/useMessages.js';
import { useMembers } from '../hooks/useMembers.js';
import { useUpload } from '../hooks/useUpload.js';
import { usePresence } from '../hooks/usePresence.js';
import { useTyping, typingLabel } from '../hooks/useTyping.js';
import { useSocket } from '../socket/SocketProvider.js';
import { Sidebar } from '../components/Sidebar.js';
import { RoomHeader } from '../components/RoomHeader.js';
import { MessageList } from '../components/MessageList.js';
import { MemberPanel } from '../components/MemberPanel.js';
import { UserCard } from '../components/UserCard.js';
import { Composer } from '../components/Composer.js';
import { ImageLightbox, MembersDialog, NewDmDialog, NewRoomDialog } from '../components/dialogs.js';
import { SettingsPage } from './SettingsPage.js';
import { PeoplePage } from './PeoplePage.js';
import { EmptyState, MessageListSkeleton, Spinner } from '../ui/primitives.js';
import { useToast } from '../ui/ToastProvider.js';
import { useStoredState } from '../hooks/useStoredState.js';

type Dialog = 'newRoom' | 'newDm' | 'members' | 'settings' | null;

export function ChatPage() {
  const { user, token, logout } = useAuth();
  const { notify } = useToast();
  const socket = useSocket();

  const {
    rooms,
    loading: roomsLoading,
    error: roomsError,
    createRoom,
    openDirectMessage,
  } = useRooms(token!);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [memberPanelOpen, setMemberPanelOpen] = useStoredState('chat-member-panel-open', true);
  const [view, setView] = useState<'chat' | 'people'>('chat');
  const [profile, setProfile] = useState<{ userId: string; anchor: DOMRect } | null>(null);

  const { messages, sendMessage, retryMessage, loadOlder, firstItemIndex, loading: messagesLoading } = useMessages(
    activeRoomId,
    user!.id,
    token!,
  );
  const { members, nameFor, avatarFor } = useMembers(token!, activeRoomId);
  const { upload, uploading, error: uploadError } = useUpload(token!, activeRoomId);
  const online = usePresence();
  const { typists, notifyTyping, stopTyping } = useTyping(activeRoomId);

  const activeRoom = view === 'chat' ? (rooms.find((r) => r.id === activeRoomId) ?? null) : null;

  async function openConversation(userId: string) {
    try {
      const room = await openDirectMessage(userId);
      setActiveRoomId(room.id);
      setView('chat');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not start conversation');
    }
  }

  // Auto-select the first conversation so the app never opens on a blank pane.
  useEffect(() => {
    if (!activeRoomId && rooms.length > 0) setActiveRoomId(rooms[0]!.id);
  }, [rooms, activeRoomId]);

  useEffect(() => {
    if (roomsError) notify(roomsError);
  }, [roomsError, notify]);

  useEffect(() => {
    if (uploadError) notify(uploadError);
  }, [uploadError, notify]);

  useEffect(() => {
    if (!socket) return;
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onError = (e: { code: string; message: string }) => notify(e.message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('error', onError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('error', onError);
    };
  }, [socket, notify]);

  return (
    <div className="flex h-full overflow-hidden bg-surface">
      {/* Mobile drawer backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform md:static md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar
          rooms={rooms}
          loading={roomsLoading}
          activeRoomId={view === 'chat' ? activeRoomId : null}
          onSelect={(id) => {
            setActiveRoomId(id);
            setView('chat');
          }}
          onNewRoom={() => setDialog('newRoom')}
          onNewDm={() => setDialog('newDm')}
          onFindPeople={() => {
            setView('people');
            setSidebarOpen(false);
          }}
          peopleActive={view === 'people'}
          avatarKey={user!.avatarKey}
          onOpenSettings={() => setDialog('settings')}
          onLogout={logout}
          username={user!.username}
          connected={connected}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex min-w-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {view === 'people' ? (
            <PeoplePage
              token={token!}
              online={online}
              onMessage={openConversation}
              onOpenProfile={(userId, anchor) => setProfile({ userId, anchor })}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
          ) : roomsLoading ? (
            <div className="flex flex-1 items-center justify-center text-content-muted">
              <Spinner />
            </div>
          ) : !activeRoom ? (
            <EmptyState title="No conversation selected" hint="Create a room or start a direct message." />
          ) : (
            <>
              <RoomHeader
                room={activeRoom}
                members={members}
                online={online}
                currentUserId={user!.id}
                onOpenMembers={() => setDialog('members')}
                onToggleMemberPanel={() => setMemberPanelOpen((open) => !open)}
                memberPanelOpen={memberPanelOpen}
                onOpenSidebar={() => setSidebarOpen(true)}
              />

              {messagesLoading ? (
                <MessageListSkeleton />
              ) : messages.length === 0 ? (
                <div className="flex-1">
                  <EmptyState title="No messages yet" hint="Say something to get the conversation started." />
                </div>
              ) : (
                <MessageList
                  messages={messages}
                  currentUserId={user!.id}
                  nameFor={nameFor}
                  avatarFor={avatarFor}
                  onOpenProfile={(userId, anchor) => setProfile({ userId, anchor })}
                  firstItemIndex={firstItemIndex}
                  loadOlder={loadOlder}
                  onRetry={retryMessage}
                  onOpenImage={setLightbox}
                />
              )}

              <Composer
                onSend={sendMessage}
                onAttach={upload}
                onTyping={notifyTyping}
                onStopTyping={stopTyping}
                typingLabel={typingLabel(typists.map((t) => t.username))}
                uploading={uploading}
                placeholder={`Message ${activeRoom.isDirect ? '' : '#'}${roomTitle(activeRoom)}`}
              />
            </>
          )}
        </main>

        {view === 'chat' && activeRoom && !activeRoom.isDirect && memberPanelOpen && (
          <div className="hidden xl:block">
            <MemberPanel
              members={members}
              online={online}
              currentUserId={user!.id}
              onOpenProfile={(userId, anchor) => setProfile({ userId, anchor })}
            />
          </div>
        )}
      </div>

      {dialog === 'newRoom' && (
        <NewRoomDialog
          token={token!}
          onClose={() => setDialog(null)}
          onCreate={async (name, memberIds) => {
            try {
              const room = await createRoom(name, memberIds);
              setActiveRoomId(room.id);
              notify(`Created ${room.name}`, 'success');
            } catch (err) {
              notify(err instanceof Error ? err.message : 'Could not create room');
            }
          }}
        />
      )}

      {dialog === 'newDm' && (
        <NewDmDialog
          token={token!}
          onClose={() => setDialog(null)}
          onStart={openConversation}
        />
      )}

      {dialog === 'members' && (
        <MembersDialog
          members={members}
          online={online}
          currentUserId={user!.id}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'settings' && <SettingsPage onClose={() => setDialog(null)} />}

      {profile && (
        <UserCard
          userId={profile.userId}
          token={token!}
          anchor={profile.anchor}
          currentUserId={user!.id}
          online={online.has(profile.userId)}
          onClose={() => setProfile(null)}
          onMessage={openConversation}
        />
      )}

      {lightbox && <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
