import { useState } from 'react';
import { useRooms } from '../hooks/useRooms.js';
import { useMessages } from '../hooks/useMessages.js';
import { useUpload } from '../hooks/useUpload.js';
import { RoomList } from './RoomList.js';
import { MessageList } from './MessageList.js';
import { Composer } from './Composer.js';

interface ChatShellProps {
  token: string;
  userId: string;
  username: string;
}

export function ChatShell({ token, userId, username }: ChatShellProps) {
  const { rooms, loading, error } = useRooms(token);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const { messages, sendMessage, loadOlder, firstItemIndex } = useMessages(activeRoomId, userId, token);
  const { upload, uploading, error: uploadError } = useUpload(token, activeRoomId);

  if (loading) return <p style={{ margin: '2rem' }}>Loading rooms...</p>;
  if (error) return <p style={{ margin: '2rem', color: 'red' }}>{error}</p>;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <RoomList rooms={rooms} activeRoomId={activeRoomId} onSelect={setActiveRoomId} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeRoomId ? (
          <>
            <MessageList
              messages={messages}
              currentUsername={username}
              currentUserId={userId}
              firstItemIndex={firstItemIndex}
              loadOlder={loadOlder}
            />
            <Composer
              onSend={sendMessage}
              onAttach={upload}
              uploading={uploading}
              uploadError={uploadError}
            />
          </>
        ) : (
          <p style={{ margin: '2rem', color: '#666' }}>Select a room to start chatting.</p>
        )}
      </div>
    </div>
  );
}
