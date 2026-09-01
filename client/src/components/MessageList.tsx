import type { DisplayMessage } from '../hooks/useMessages.js';

interface MessageListProps {
  messages: DisplayMessage[];
  currentUsername: string;
  currentUserId: string;
}

export function MessageList({ messages, currentUsername, currentUserId }: MessageListProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
      {messages.map((m) => (
        <div key={m.tempId ?? m.id} style={{ opacity: m.status === 'pending' ? 0.5 : 1 }}>
          <strong>{m.senderId === currentUserId ? currentUsername : m.senderId}:</strong> {m.body}
        </div>
      ))}
    </div>
  );
}
