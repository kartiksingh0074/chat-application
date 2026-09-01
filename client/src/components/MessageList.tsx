import { Virtuoso } from 'react-virtuoso';
import type { DisplayMessage } from '../hooks/useMessages.js';
import { attachmentUrl } from '../config.js';

interface MessageListProps {
  messages: DisplayMessage[];
  currentUsername: string;
  currentUserId: string;
  firstItemIndex: number;
  loadOlder: () => void;
}

const STATUS_OPACITY: Record<DisplayMessage['status'], number> = {
  pending: 0.5,
  delivered: 1,
  failed: 1,
};

export function MessageList({ messages, currentUsername, currentUserId, firstItemIndex, loadOlder }: MessageListProps) {
  return (
    <Virtuoso
      style={{ flex: 1 }}
      data={messages}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={messages.length - 1}
      startReached={loadOlder}
      followOutput="smooth"
      computeItemKey={(_, m) => m.tempId ?? m.id}
      itemContent={(_, m) => (
        <div style={{ padding: '2px 8px', opacity: STATUS_OPACITY[m.status] }}>
          <strong>{m.senderId === currentUserId ? currentUsername : m.senderId}:</strong> {m.body}
          {m.status === 'failed' && <span style={{ color: 'red', marginLeft: 6 }}>failed to send</span>}
          {m.attachmentKey && (
            <div>
              <img
                src={attachmentUrl(m.attachmentKey)}
                alt="attachment"
                style={{ maxWidth: 320, maxHeight: 240, display: 'block', marginTop: 4 }}
              />
            </div>
          )}
        </div>
      )}
    />
  );
}
